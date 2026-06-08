-- ============================================================
-- migrations/001_rag_upgrade.sql
-- Darvis RAG Upgrade — run once in Supabase SQL Editor.
-- Idempotent: safe to re-run.
-- ============================================================

-- pgvector and pg_trgm must be enabled.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. Full-text search column on embeddings ────────────────
-- GENERATED ALWAYS AS keeps fts in sync automatically.
ALTER TABLE embeddings
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- ── 2. Add metadata_json column (already jsonb? rename-safe) ─
-- Ensures metadata is stored as jsonb for efficient filtering.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='embeddings' AND column_name='metadata'
  ) THEN
    ALTER TABLE embeddings ADD COLUMN metadata jsonb DEFAULT '{}';
  END IF;
END $$;

-- ── 3. Drop old IVFFlat index if it exists, add HNSW ────────
-- HNSW is faster for query time at this dataset size (< 100k rows).
-- ef_construction=64 and m=16 are good defaults for ~5k–100k vectors.
DROP INDEX IF EXISTS idx_embeddings_embedding;
DROP INDEX IF EXISTS embeddings_embedding_idx;

CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
  ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 4. GIN index for full-text search ───────────────────────
CREATE INDEX IF NOT EXISTS idx_embeddings_fts
  ON embeddings USING gin(fts);

-- ── 5. Trigram index for fuzzy keyword matching ──────────────
CREATE INDEX IF NOT EXISTS idx_embeddings_content_trgm
  ON embeddings USING gin(content gin_trgm_ops);

-- ── 6. Source-type index for filtered retrieval ─────────────
CREATE INDEX IF NOT EXISTS idx_embeddings_source_type
  ON embeddings (source_type);

-- ── 7. Improved vector-only search RPC ──────────────────────
-- Drop ALL overloads of search_embeddings by querying pg_proc.
-- This handles the case where multiple versions exist with different
-- argument lists, which causes "function name is not unique" on DROP.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'search_embeddings'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION search_embeddings(
  query_embedding vector,
  match_count     int     DEFAULT 10,
  min_similarity  float   DEFAULT 0.2,
  source_filter   text    DEFAULT NULL
)
RETURNS TABLE (
  id          bigint,
  content     text,
  source_type text,
  source_id   text,
  metadata    jsonb,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id,
    e.content,
    e.source_type,
    e.source_id,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM embeddings e
  WHERE
    e.embedding IS NOT NULL
    AND (source_filter IS NULL OR e.source_type = source_filter)
    AND 1 - (e.embedding <=> query_embedding) >= min_similarity
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── 8. Full-text keyword search RPC ─────────────────────────
CREATE OR REPLACE FUNCTION search_embeddings_fts(
  query_text    text,
  match_count   int  DEFAULT 10,
  source_filter text DEFAULT NULL
)
RETURNS TABLE (
  id          bigint,
  content     text,
  source_type text,
  source_id   text,
  metadata    jsonb,
  rank        float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id,
    e.content,
    e.source_type,
    e.source_id,
    e.metadata,
    ts_rank_cd(e.fts, plainto_tsquery('english', query_text))::float AS rank
  FROM embeddings e
  WHERE
    e.fts @@ plainto_tsquery('english', query_text)
    AND (source_filter IS NULL OR e.source_type = source_filter)
  ORDER BY rank DESC
  LIMIT match_count;
$$;

-- ── 9. Hybrid search RPC (RRF fusion) ───────────────────────
-- Reciprocal Rank Fusion merges vector and keyword rankings.
-- alpha controls the blend: 1.0 = pure vector, 0.0 = pure keyword.
-- rrf_k=60 is the standard RRF smoothing constant.
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector,
  query_text      text,
  match_count     int   DEFAULT 20,
  alpha           float DEFAULT 0.7,
  source_filter   text  DEFAULT NULL
)
RETURNS TABLE (
  id             bigint,
  content        text,
  source_type    text,
  source_id      text,
  metadata       jsonb,
  vector_score   float,
  keyword_score  float,
  combined_score float
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  rrf_k CONSTANT int := 60;
  candidate_n CONSTANT int := match_count * 3;  -- retrieve 3x for fusion headroom
BEGIN
  RETURN QUERY
  WITH
  vector_ranked AS (
    SELECT
      e.id,
      e.content,
      e.source_type,
      e.source_id,
      e.metadata,
      (1 - (e.embedding <=> query_embedding))::float           AS vscore,
      ROW_NUMBER() OVER (ORDER BY e.embedding <=> query_embedding) AS vrank
    FROM embeddings e
    WHERE
      e.embedding IS NOT NULL
      AND (source_filter IS NULL OR e.source_type = source_filter)
    ORDER BY e.embedding <=> query_embedding
    LIMIT candidate_n
  ),
  keyword_ranked AS (
    SELECT
      e.id,
      ts_rank_cd(e.fts, plainto_tsquery('english', query_text))::float AS kscore,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(e.fts, plainto_tsquery('english', query_text)) DESC
      ) AS krank
    FROM embeddings e
    WHERE
      e.fts @@ plainto_tsquery('english', query_text)
      AND (source_filter IS NULL OR e.source_type = source_filter)
    LIMIT candidate_n
  ),
  fused AS (
    SELECT
      COALESCE(v.id, k.id)                   AS id,
      COALESCE(v.content, '')                 AS content,
      COALESCE(v.source_type, '')             AS source_type,
      COALESCE(v.source_id, '')               AS source_id,
      COALESCE(v.metadata, '{}'::jsonb)       AS metadata,
      COALESCE(v.vscore, 0.0)                 AS vector_score,
      COALESCE(k.kscore, 0.0)                 AS keyword_score,
      -- RRF combined score
      (      alpha  / (rrf_k + COALESCE(v.vrank, candidate_n + 1)))
      + ((1 - alpha) / (rrf_k + COALESCE(k.krank, candidate_n + 1))) AS combined_score
    FROM vector_ranked  v
    FULL OUTER JOIN keyword_ranked k ON v.id = k.id
  )
  SELECT
    f.id,
    f.content,
    f.source_type,
    f.source_id,
    f.metadata,
    f.vector_score,
    f.keyword_score,
    f.combined_score
  FROM fused f
  ORDER BY f.combined_score DESC
  LIMIT match_count;
END;
$$;

-- ── 10. Grant execute on new functions ───────────────────────
GRANT EXECUTE ON FUNCTION search_embeddings TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_embeddings_fts TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION hybrid_search TO anon, authenticated, service_role;

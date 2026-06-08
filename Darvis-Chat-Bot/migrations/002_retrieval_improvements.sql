-- ============================================================
-- migrations/002_retrieval_improvements.sql
-- Darvis RAG — incremental improvements. Run after 001.
-- Idempotent: safe to re-run.
-- ============================================================

-- ── 1. Trigram similarity search RPC ────────────────────────
-- Fallback for FTS when plainto_tsquery returns no results
-- (e.g. vague queries like "brutal for algorithms" or very short queries).
-- Uses the idx_embeddings_content_trgm index created in 001.
CREATE OR REPLACE FUNCTION search_embeddings_trigram(
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
    similarity(e.content, query_text)::float AS rank
  FROM embeddings e
  WHERE
    similarity(e.content, query_text) > 0.05
    AND (source_filter IS NULL OR e.source_type = source_filter)
  ORDER BY similarity(e.content, query_text) DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION search_embeddings_trigram TO anon, authenticated, service_role;

-- ── 2. Feedback table indexes ────────────────────────────────
-- Enable efficient analytics on the feedback table.
-- The /feedback endpoint writes to this table; without indexes,
-- analytical queries across thousands of rows are slow.

-- Index on rating for thumbs-up vs thumbs-down breakdown queries
CREATE INDEX IF NOT EXISTS idx_feedback_rating
  ON feedback (rating);

-- Index on route for per-route satisfaction analysis
CREATE INDEX IF NOT EXISTS idx_feedback_route
  ON feedback (route);

-- Index on created_at for time-series analysis (weekly/monthly trends)
CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON feedback (created_at DESC);

-- ── 3. Composite index for embeddings source lookup ──────────
-- Speeds up the rebuild_embeddings.py "which chunks already exist?" check.
CREATE INDEX IF NOT EXISTS idx_embeddings_source_lookup
  ON embeddings (source_type, source_id);

-- ── 4. Partial index for grade chunks (most common retrieval target) ──
-- Speeds up hybrid_search when source_filter='grade' is passed.
CREATE INDEX IF NOT EXISTS idx_embeddings_grade_hnsw
  ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE source_type = 'grade';

"""
app/rag/retriever.py

Hybrid retrieval combining pgvector cosine search with Postgres full-text
search (tsvector), fused via Reciprocal Rank Fusion (RRF).

Why hybrid?
  - Vector search excels at semantic paraphrases ("which prof is brutal for
    algorithms?" → retrieves CS 3114 grade docs by meaning).
  - Keyword search catches exact identifiers (course codes, instructor names,
    GPA values) that embeddings may dilute.
  - RRF fusion avoids score normalization issues between the two systems.

Flow:
  embed(query) → hybrid_search RPC → deduplicate → list[RetrievalResult]
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger("darvis.retriever")


@dataclass
class RetrievalResult:
    """A single retrieved document chunk with retrieval metadata."""
    id: int
    content: str
    source_type: str          # "course" | "grade" | "requirement" | "instructor"
    source_id: str
    metadata: dict
    vector_score: float = 0.0
    keyword_score: float = 0.0
    combined_score: float = 0.0
    rerank_score: float | None = None


class HybridRetriever:
    """
    Executes hybrid (vector + keyword) retrieval against the Supabase
    `embeddings` table using pre-built RPC functions from the migration.

    Falls back gracefully:
      - If embeddings unavailable → keyword-only search
      - If FTS index unavailable → vector-only search
      - If both fail → empty list (never raises)
    """

    def __init__(self, supabase_client, embedder, settings=None):
        from app.config import get_settings
        cfg = settings or get_settings()
        self._db = supabase_client
        self._embedder = embedder
        self._alpha: float = getattr(cfg, "rag_vector_weight", 0.7)
        self._top_k: int = getattr(cfg, "rag_top_k_retrieve", 20)
        self._min_similarity: float = getattr(cfg, "rag_min_similarity", 0.2)
        self._semantic_ready: bool = False
        self._fts_ready: bool = False
        self._embedding_count: int = 0
        self._check_readiness()

    def _check_readiness(self):
        """Probe Supabase to see which retrieval modes are available."""
        try:
            result = self._db.table("embeddings").select("id", count="exact").limit(1).execute()
            self._embedding_count = result.count or 0
            self._semantic_ready = self._embedding_count > 0 and self._embedder.available
            self._fts_ready = self._embedding_count > 0  # FTS works as long as migration ran
            logger.info(
                "[retriever] Ready — %d embeddings, semantic=%s, fts=%s",
                self._embedding_count, self._semantic_ready, self._fts_ready,
            )
        except Exception as exc:
            logger.error("[retriever] readiness check failed: %s", exc)
            self._embedding_count = 0

    @property
    def semantic_ready(self) -> bool:
        return self._semantic_ready

    @property
    def fts_ready(self) -> bool:
        return self._fts_ready

    def embedding_count(self) -> int:
        """Total number of embedded chunks in Supabase (used by /health)."""
        return self._embedding_count

    def retrieve(
        self,
        query: str,
        top_k: int | None = None,
        source_filter: str | None = None,
        alpha: float | None = None,
    ) -> list[RetrievalResult]:
        """
        Main retrieval entry point. Uses hybrid search when possible,
        degrades to vector-only or keyword-only as needed.

        Args:
            query: The (possibly rewritten) user question.
            top_k: Override the default candidate count.
            source_filter: Restrict to a source type ("course", "grade", etc.)
            alpha: Vector weight override (0.0=keyword-only, 1.0=vector-only).
        """
        k = top_k or self._top_k
        a = alpha if alpha is not None else self._alpha

        if self._semantic_ready and self._fts_ready:
            return self._hybrid(query, k, a, source_filter)
        if self._semantic_ready:
            return self._vector_only(query, k, source_filter)
        if self._fts_ready:
            return self._keyword_only(query, k, source_filter)

        logger.warning("[retriever] No retrieval mode available — returning empty")
        return []

    # ── Retrieval implementations ──────────────────────────────────────────────

    def _hybrid(
        self,
        query: str,
        top_k: int,
        alpha: float,
        source_filter: str | None,
    ) -> list[RetrievalResult]:
        """Call the hybrid_search RPC (vector + FTS fused via RRF)."""
        vector = self._embedder.embed(query)
        if vector is None:
            logger.warning("[retriever] Embedding failed, falling back to keyword-only")
            return self._keyword_only(query, top_k, source_filter)

        try:
            result = self._db.rpc(
                "hybrid_search",
                {
                    "query_embedding": vector,
                    "query_text": query,
                    "match_count": top_k,
                    "alpha": alpha,
                    "source_filter": source_filter,
                },
            ).execute()
            return [self._row_to_result(r) for r in (result.data or [])]
        except Exception as exc:
            logger.error("[retriever] hybrid_search RPC failed: %s", exc)
            # Try vector-only fallback
            return self._vector_only(query, top_k, source_filter)

    def _vector_only(
        self,
        query: str,
        top_k: int,
        source_filter: str | None,
    ) -> list[RetrievalResult]:
        """Call search_embeddings RPC (cosine similarity only)."""
        vector = self._embedder.embed(query)
        if vector is None:
            return []
        try:
            result = self._db.rpc(
                "search_embeddings",
                {
                    "query_embedding": vector,
                    "match_count": top_k,
                    "min_similarity": self._min_similarity,
                    "source_filter": source_filter,
                },
            ).execute()
            return [
                self._row_to_result(r, combined_from_similarity=True)
                for r in (result.data or [])
            ]
        except Exception as exc:
            logger.error("[retriever] search_embeddings RPC failed: %s", exc)
            return []

    def _keyword_only(
        self,
        query: str,
        top_k: int,
        source_filter: str | None,
    ) -> list[RetrievalResult]:
        """
        Call search_embeddings_fts RPC (Postgres full-text only).
        Falls back to trigram similarity search when FTS returns no results —
        this handles vague queries like "brutal for algorithms" where
        plainto_tsquery produces no FTS matches.
        """
        try:
            result = self._db.rpc(
                "search_embeddings_fts",
                {
                    "query_text": query,
                    "match_count": top_k,
                    "source_filter": source_filter,
                },
            ).execute()
            rows = result.data or []
            if rows:
                return [self._row_to_result(r, from_fts=True) for r in rows]
        except Exception as exc:
            logger.error("[retriever] FTS search failed: %s", exc)

        # Trigram fallback: pg_trgm ILIKE search for queries that produce no
        # FTS tokens (stop-word-only or very short queries).
        return self._trigram_fallback(query, top_k, source_filter)

    def _trigram_fallback(
        self,
        query: str,
        top_k: int,
        source_filter: str | None,
    ) -> list[RetrievalResult]:
        """
        Trigram similarity fallback using the idx_embeddings_content_trgm index.
        Returns results ordered by pg_trgm similarity to the query.
        """
        try:
            result = self._db.rpc(
                "search_embeddings_trigram",
                {
                    "query_text": query,
                    "match_count": top_k,
                    "source_filter": source_filter,
                },
            ).execute()
            return [
                self._row_to_result(r, from_fts=True)
                for r in (result.data or [])
            ]
        except Exception as exc:
            logger.debug("[retriever] Trigram fallback failed: %s", exc)
            return []

    # ── Helpers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_result(
        row: dict,
        combined_from_similarity: bool = False,
        from_fts: bool = False,
    ) -> RetrievalResult:
        meta = row.get("metadata") or {}
        if isinstance(meta, str):
            import json
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}
        sim = float(row.get("similarity", 0.0))
        kw = float(row.get("rank", 0.0)) if from_fts else float(row.get("keyword_score", 0.0))
        vec = sim if combined_from_similarity else float(row.get("vector_score", 0.0))
        combined = sim if combined_from_similarity else (
            float(row.get("rank", 0.0)) if from_fts else float(row.get("combined_score", 0.0))
        )
        return RetrievalResult(
            id=int(row.get("id", 0)),
            content=str(row.get("content", "")),
            source_type=str(row.get("source_type", "")),
            source_id=str(row.get("source_id", "")),
            metadata=meta,
            vector_score=vec,
            keyword_score=kw,
            combined_score=combined,
        )

    def format_context(self, results: list[RetrievalResult]) -> str:
        """
        Format retrieved chunks into a single context string for the LLM.

        Each chunk is prefixed with a header that includes the source type AND
        the key entity from metadata (course code, instructor name, major name)
        so the LLM knows exactly what data it's reading when generating citations.
        """
        if not results:
            return ""

        parts = []
        for r in results:
            header = self._chunk_header(r)
            parts.append(f"[{header}]\n{r.content}")
        return "\n\n".join(parts)

    @staticmethod
    def _chunk_header(r: "RetrievalResult") -> str:
        """Build a context header like 'Grade data — CS 3114, Hamouda'."""
        label = {
            "grade": "Grade data",
            "course": "Course catalog",
            "requirement": "Major requirements",
            "instructor": "Instructor profile",
        }.get(r.source_type, "Context")

        meta = r.metadata or {}
        entity_parts: list[str] = []

        if r.source_type == "grade":
            subj = meta.get("subject", "")
            num  = meta.get("course_number", "")
            instr = meta.get("instructor", "")
            if subj and num:
                entity_parts.append(f"{subj} {num}")
            if instr and instr.lower() != "staff":
                entity_parts.append(instr)

        elif r.source_type == "course":
            subj = meta.get("subject", "")
            num  = meta.get("course_number", "")
            if subj and num:
                entity_parts.append(f"{subj} {num}")

        elif r.source_type == "requirement":
            major = meta.get("major_name", "")
            rtype = meta.get("requirement_type", "")
            if major:
                entity_parts.append(major)
            if rtype:
                entity_parts.append(rtype)

        elif r.source_type == "instructor":
            name = meta.get("name", "")
            if name:
                entity_parts.append(name)

        if entity_parts:
            return f"{label} — {', '.join(entity_parts)}"
        return label

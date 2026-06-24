"""
app/rag/vector_store.py

GradeVectorStore — public interface for all context retrieval in the chatbot.

The internal implementation now delegates to RAGPipeline, which provides:
  - Hybrid retrieval (vector + full-text search via Postgres)
  - Query rewriting before retrieval
  - Cross-encoder or Cohere reranking after retrieval

All existing handlers call vector_store.query(question, n_results) and receive
a formatted context string. The upgrade is transparent to callers.

Backward compatibility:
  - query(question, n_results) signature unchanged
  - rebuild(df, courses_df, requirements_df) signature unchanged
  - set_clients(supabase) signature unchanged
  - count() signature unchanged

Anti-patterns removed:
  - Keyword token extraction (regex-based, misses paraphrases)
  - Manual scoring by string contains() in pandas
  - Hardcoded similarity threshold as the only quality filter
"""

from __future__ import annotations

import logging
import pandas as pd
from supabase import Client as SupabaseClient

logger = logging.getLogger("darvis.vector_store")


class GradeVectorStore:
    """
    Semantic retrieval store backed by Supabase pgvector + full-text search.

    Pipeline: query_rewrite → embed → hybrid_search → rerank → context string.
    Falls back to keyword search if semantic retrieval is unavailable.
    """

    def __init__(self):
        self._pipeline = None           # RAGPipeline, set in set_clients()
        self._agentic = None            # AgenticRAGPipeline, wraps _pipeline
        self._df: pd.DataFrame | None = None
        self._courses: pd.DataFrame | None = None
        self._requirements: pd.DataFrame | None = None
        self._count: int = 0

    # ── Initialization ──────────────────────────────────────────────────────────

    def rebuild(
        self,
        df: pd.DataFrame,
        courses_df: pd.DataFrame | None = None,
        requirements_df: pd.DataFrame | None = None,
    ) -> None:
        """Store DataFrames for use in keyword fallback. Called at startup."""
        self._df = df.copy() if df is not None else pd.DataFrame()
        self._courses = courses_df.copy() if courses_df is not None else None
        self._requirements = requirements_df.copy() if requirements_df is not None else None
        self._count = len(self._df)
        logger.info(
            "[vector_store] DataFrames stored: %d grade rows, %d courses, %d requirements",
            self._count,
            len(self._courses) if self._courses is not None else 0,
            len(self._requirements) if self._requirements is not None else 0,
        )

    def set_clients(self, supabase: SupabaseClient, llm_client=None, google=None) -> None:
        """
        Initialize the RAG pipeline. `supabase` is kept for signature stability
        and potential direct queries elsewhere; retrieval itself reads from the
        Redis index (REDIS_URL in settings), synced from Supabase by
        scripts/sync_redis_index.py. `llm_client` is passed to the query
        rewriter for LLM-powered expansion AND to the retrieval critic for the
        LLM-judgement fallback (does retrieved context actually answer the
        question?). `google` is kept for backward compatibility but unused.
        """
        try:
            from app.config import get_settings
            from app.rag.pipeline import RAGPipeline
            from app.rag.agentic_pipeline import AgenticRAGPipeline
            settings = get_settings()
            self._pipeline = RAGPipeline(redis_url=settings.redis_url, llm_client=llm_client)
            self._agentic = AgenticRAGPipeline(self._pipeline, llm_client=llm_client)
            logger.info("[vector_store] Agentic RAG pipeline initialized: %s", self._agentic.status())
        except Exception as exc:
            logger.error("[vector_store] RAG pipeline init failed, keyword fallback only: %s", exc)
            self._pipeline = None
            self._agentic = None

    def set_llm(self, llm) -> None:
        """Attach LLM to the query rewriter. Kept for backward compatibility."""
        if self._pipeline is not None:
            self._pipeline._rewriter.set_llm(llm)
            logger.info("[vector_store] LLM attached to query rewriter")

    # ── Public interface ────────────────────────────────────────────────────────

    def count(self) -> int:
        """Returns number of embedding vectors in Supabase. Falls back to grade row count."""
        active = self._agentic or self._pipeline
        if active is not None:
            try:
                return active.retriever.embedding_count()
            except Exception:
                pass
        return self._count

    def query(self, question: str, n_results: int = 10) -> str:
        """
        Retrieve relevant context for a question via the agentic pipeline.
        Returns a formatted context string. Never raises.
        """
        if not question or not question.strip():
            return ""

        # Primary: agentic pipeline (plan → retrieve → critique → self-correct)
        if self._agentic is not None:
            try:
                context = self._agentic.retrieve(question, n_results=n_results)
                if context:
                    return context
            except Exception as exc:
                logger.error("[vector_store] Agentic pipeline failed, trying base: %s", exc)

        # Secondary: base pipeline without agentic loop
        if self._pipeline is not None:
            try:
                context = self._pipeline.retrieve(question, n_results=n_results)
                if context:
                    return context
            except Exception as exc:
                logger.error("[vector_store] Base pipeline failed, using keyword fallback: %s", exc)

        return self._keyword_fallback(question, n_results)

    def last_debug_info(self):
        """Return the most recent pipeline debug snapshot (for /retrieval/debug)."""
        active = self._agentic or self._pipeline
        if active is not None:
            return active.last_debug_info
        return None

    def rag_status(self) -> dict:
        """Return pipeline component status for /health endpoint."""
        if self._agentic is not None:
            return self._agentic.status()
        if self._pipeline is not None:
            return self._pipeline.status()
        return {"status": "keyword_fallback_only"}

    # ── Keyword fallback ────────────────────────────────────────────────────────

    def _keyword_fallback(self, question: str, n_results: int) -> str:
        """
        Original keyword-based retrieval. Used when the RAG pipeline is
        unavailable (no Supabase connection, no embeddings).
        Preserved for resilience; not the primary path.
        """
        import re
        if self._df is None or len(self._df) == 0:
            return ""

        tokens = re.findall(r'\b[A-Za-z]{2,4}\b|\b\d{4}\b|\b[A-Z][a-z]{2,}\b', question)
        keywords = list({t.upper() for t in tokens if len(t) >= 2})

        docs: list[str] = []

        # Score grade rows
        grade_cols = ["Subject", "Course No.", "Course Title", "Instructor"]
        if keywords:
            scores = pd.Series(0, index=self._df.index)
            for col in grade_cols:
                if col in self._df.columns:
                    col_upper = self._df[col].astype(str).str.upper()
                    for kw in keywords:
                        scores += col_upper.str.contains(kw, regex=False, na=False).astype(int)
            sample = self._df.loc[scores.nlargest(min(n_results, len(self._df))).index]
        else:
            sample = self._df.sample(min(n_results, len(self._df)))

        for _, row in sample.iterrows():
            docs.append(
                f"[Grade data]\n"
                f"{row.get('Subject')} {row.get('Course No.')} "
                f"({row.get('Course Title', 'N/A')}) — {row.get('Instructor', 'N/A')}\n"
                f"GPA: {row.get('GPA', 'N/A')}  "
                f"A%: {row.get('A (%)', 'N/A')}  "
                f"F%: {row.get('F (%)', 'N/A')}  "
                f"Enrolled: {row.get('Graded Enrollment', 'N/A')}"
            )

        # Score course rows
        if self._courses is not None and keywords:
            cat_cols = ["subject", "course_number", "title", "Course"]
            cat_scores = pd.Series(0, index=self._courses.index)
            for col in cat_cols:
                if col in self._courses.columns:
                    col_upper = self._courses[col].astype(str).str.upper()
                    for kw in keywords:
                        cat_scores += col_upper.str.contains(kw, regex=False, na=False).astype(int)
            top_cat = self._courses.loc[cat_scores.nlargest(min(5, len(self._courses))).index]
            top_cat = top_cat[cat_scores.loc[top_cat.index] > 0]
            for _, row in top_cat.iterrows():
                gpa_str = f"  Avg GPA: {row['avg_gpa']}" if pd.notna(row.get("avg_gpa")) else ""
                docs.append(
                    f"[Course catalog]\n"
                    f"{row.get('subject')} {row.get('course_number')}: "
                    f"{row.get('title', 'N/A')}{gpa_str}"
                )

        # Score requirement rows
        if self._requirements is not None and keywords:
            req_cols = ["major_name", "course_code", "course_title", "requirement_type"]
            req_scores = pd.Series(0, index=self._requirements.index)
            for col in req_cols:
                if col in self._requirements.columns:
                    col_upper = self._requirements[col].astype(str).str.upper()
                    for kw in keywords:
                        req_scores += col_upper.str.contains(kw, regex=False, na=False).astype(int)
            top_req = self._requirements.loc[req_scores.nlargest(min(8, len(self._requirements))).index]
            top_req = top_req[req_scores.loc[top_req.index] > 0]
            if not top_req.empty:
                by_major: dict[str, list[str]] = {}
                for _, row in top_req.iterrows():
                    mname = row.get("major_name", "Unknown Major")
                    entry = row.get("course_code", "")
                    if row.get("course_title"):
                        entry += f" ({row['course_title']})"
                    by_major.setdefault(mname, []).append(entry)
                for mname, courses in by_major.items():
                    docs.append(
                        f"[Major requirements — {mname}]\n"
                        + "\n".join(f"  • {c}" for c in courses)
                    )

        return "\n\n".join(docs)

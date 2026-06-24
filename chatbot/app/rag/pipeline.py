"""
app/rag/pipeline.py

RAG pipeline orchestrator.

Full flow:
  query_rewriter  →  embedder  →  hybrid retriever  →  reranker  →  context string

The pipeline is the single entry point for all context retrieval in the chatbot.
GradeVectorStore.query() delegates to Pipeline.retrieve() so all existing
handlers get semantic retrieval with zero code changes.

Design decisions:
  - All stages have graceful fallbacks (never raises to the caller)
  - Debug mode captures full telemetry for the /retrieval/debug endpoint
  - The pipeline is stateless between requests (thread-safe)
  - Top-K at retrieval (default 20) > top-N sent to LLM (default 5)
    This gives the reranker enough candidates to find truly relevant chunks.
"""

from __future__ import annotations

import logging

from app.rag.embedder import EmbeddingService
from app.rag.retriever import HybridRetriever, RetrievalResult
from app.rag.reranker import Reranker
from app.rag.query_rewriter import QueryRewriter
from app.rag.observability import (
    PipelineTimer,
    RetrievalDebugInfo,
    build_debug_info,
    log_retrieval,
)

logger = logging.getLogger("darvis.pipeline")


class RAGPipeline:
    """
    Orchestrates the full semantic RAG retrieval pipeline.

    Initialized once at startup (in GradeVectorStore) and reused across requests.
    """

    def __init__(
        self,
        redis_url: str = "",
        llm_client=None,
        settings=None,
    ):
        from app.config import get_settings
        cfg = settings or get_settings()

        self._debug_mode: bool = getattr(cfg, "rag_debug_mode", False)
        self._top_k_llm: int = getattr(cfg, "rag_top_k_rerank", 5)
        self._last_debug_info: RetrievalDebugInfo | None = None

        # Initialize pipeline stages
        self._embedder = EmbeddingService(settings=cfg)
        self._retriever = HybridRetriever(redis_url or getattr(cfg, "redis_url", ""), self._embedder, settings=cfg)
        self._reranker = Reranker(settings=cfg)
        self._rewriter = QueryRewriter(llm_client=llm_client, settings=cfg)

        logger.info(
            "[pipeline] Ready — embed=%s retrieve(semantic=%s, fts=%s) rerank=%s",
            self._embedder.provider,
            self._retriever.semantic_ready,
            self._retriever.fts_ready,
            self._reranker.provider,
        )

    # ── Public API ──────────────────────────────────────────────────────────────

    @property
    def embedder(self) -> EmbeddingService:
        return self._embedder

    @property
    def retriever(self) -> HybridRetriever:
        return self._retriever

    @property
    def last_debug_info(self) -> RetrievalDebugInfo | None:
        """Returns the debug info from the most recent retrieve() call."""
        return self._last_debug_info

    def retrieve(
        self,
        question: str,
        n_results: int = 10,
        source_filter: str | None = None,
        route: str = "unknown",
        entity_filter: dict | None = None,
    ) -> str:
        """
        Full RAG retrieval pipeline. Returns a formatted context string
        ready to inject into the LLM prompt.

        This is the drop-in replacement for GradeVectorStore._keyword_query().
        """
        if not question or not question.strip():
            return ""

        timing: dict[str, float] = {}

        # Stage 1: Query rewriting
        with PipelineTimer("rewrite", timing):
            rewritten = self._rewriter.rewrite(question)

        if rewritten.rewritten != rewritten.original:
            logger.debug(
                "[pipeline] Query rewrite [%s]: %r → %r",
                rewritten.method, question[:60], rewritten.rewritten[:60],
            )

        # Stage 2: Hybrid retrieval (vector + FTS)
        top_k_retrieve = max(n_results * 3, 15)  # retrieve 3x for reranker headroom
        with PipelineTimer("retrieve", timing):
            candidates = self._retriever.retrieve(
                rewritten.rewritten,
                top_k=top_k_retrieve,
                source_filter=source_filter,
                entity_filter=entity_filter,
            )

        if not candidates:
            logger.debug("[pipeline] No candidates retrieved for: %r", question[:60])
            self._last_debug_info = build_debug_info(
                rewritten, [], [], self._embedder.provider, self._reranker.provider, timing
            )
            return ""

        # Stage 3: Reranking
        top_k_rerank = min(n_results, self._top_k_llm)
        with PipelineTimer("rerank", timing):
            selected = self._reranker.rerank(question, candidates, top_k=top_k_rerank)

        # Build debug info (always, since cost is negligible)
        self._last_debug_info = build_debug_info(
            rewritten, candidates, selected,
            self._embedder.provider, self._reranker.provider, timing,
        )

        if self._debug_mode or logger.isEnabledFor(logging.DEBUG):
            log_retrieval(question, self._last_debug_info, route, "")

        # Stage 4: Format context for LLM
        return self._retriever.format_context(selected)

    def retrieve_full(
        self,
        question: str,
        n_results: int = 10,
        source_filter: str | None = None,
        route: str = "unknown",
        alpha: float | None = None,
        entity_filter: dict | None = None,
    ) -> tuple[str, list[RetrievalResult]]:
        """
        Like retrieve() but also returns the reranked RetrievalResult list so
        AgenticRAGPipeline can inspect scores without a second retrieval call.
        """
        if not question or not question.strip():
            return "", []

        timing: dict[str, float] = {}

        with PipelineTimer("rewrite", timing):
            rewritten = self._rewriter.rewrite(question)

        top_k_retrieve = max(n_results * 3, 15)
        with PipelineTimer("retrieve", timing):
            candidates = self._retriever.retrieve(
                rewritten.rewritten,
                top_k=top_k_retrieve,
                source_filter=source_filter,
                alpha=alpha,
                entity_filter=entity_filter,
            )

        if not candidates:
            self._last_debug_info = build_debug_info(
                rewritten, [], [], self._embedder.provider, self._reranker.provider, timing
            )
            return "", []

        top_k_rerank = min(n_results, self._top_k_llm)
        with PipelineTimer("rerank", timing):
            selected = self._reranker.rerank(question, candidates, top_k=top_k_rerank)

        self._last_debug_info = build_debug_info(
            rewritten, candidates, selected,
            self._embedder.provider, self._reranker.provider, timing,
        )

        if self._debug_mode or logger.isEnabledFor(logging.DEBUG):
            log_retrieval(question, self._last_debug_info, route, "")

        return self._retriever.format_context(selected), selected

    def status(self) -> dict:
        """Returns pipeline component status for the /health endpoint."""
        return {
            "embedding_provider": self._embedder.provider,
            "embedding_dim": self._embedder.dim,
            "vector_backend": "redis",
            "semantic_ready": self._retriever.semantic_ready,
            "fts_ready": self._retriever.fts_ready,
            "reranker": self._reranker.provider,
            "query_rewrite": self._rewriter._enabled,
        }

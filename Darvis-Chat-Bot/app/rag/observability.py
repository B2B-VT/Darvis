"""
app/rag/observability.py

Retrieval debugging and logging utilities.

Captures per-request pipeline telemetry:
  - Original + rewritten query
  - Retrieval candidates with vector/keyword/combined scores
  - Reranked results with rerank scores
  - Final chunks sent to LLM
  - Timing breakdowns
  - Provider used at each stage

Used by:
  - The /retrieval/debug endpoint (debug mode)
  - Server-side logging for retrieval quality monitoring
  - The feedback table (latency + route metadata)
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.rag.retriever import RetrievalResult
    from app.rag.query_rewriter import RewrittenQuery

logger = logging.getLogger("darvis.rag")


@dataclass
class ChunkDebugInfo:
    """Debug info for a single retrieved/reranked chunk."""
    content: str
    source_type: str
    source_id: str
    vector_score: float
    keyword_score: float
    combined_score: float
    rerank_score: float | None
    selected: bool  # True if sent to LLM


@dataclass
class RetrievalDebugInfo:
    """Full debug snapshot of one RAG pipeline execution."""
    original_query: str
    rewritten_query: str
    rewrite_method: str           # "llm" | "rules" | "passthrough"
    embedding_provider: str       # "openai" | "google" | "fastembed" | "none"
    reranker_provider: str        # "cohere" | "cross_encoder" | "passthrough"
    n_candidates: int             # chunks from retrieval before reranking
    n_selected: int               # chunks sent to LLM
    candidates: list[ChunkDebugInfo] = field(default_factory=list)
    timing_ms: dict[str, float] = field(default_factory=dict)  # stage → ms

    def to_dict(self) -> dict:
        return {
            "original_query": self.original_query,
            "rewritten_query": self.rewritten_query,
            "rewrite_method": self.rewrite_method,
            "embedding_provider": self.embedding_provider,
            "reranker_provider": self.reranker_provider,
            "n_candidates": self.n_candidates,
            "n_selected": self.n_selected,
            "timing_ms": self.timing_ms,
            "candidates": [
                {
                    "content": c.content[:200] + "..." if len(c.content) > 200 else c.content,
                    "source_type": c.source_type,
                    "source_id": c.source_id,
                    "vector_score": round(c.vector_score, 4),
                    "keyword_score": round(c.keyword_score, 4),
                    "combined_score": round(c.combined_score, 4),
                    "rerank_score": round(c.rerank_score, 4) if c.rerank_score is not None else None,
                    "selected": c.selected,
                }
                for c in self.candidates
            ],
        }


class PipelineTimer:
    """Context manager for timing pipeline stages."""

    def __init__(self, stage: str, timing: dict):
        self._stage = stage
        self._timing = timing
        self._start: float = 0.0

    def __enter__(self):
        self._start = time.time()
        return self

    def __exit__(self, *_):
        self._timing[self._stage] = round((time.time() - self._start) * 1000, 1)


def log_retrieval(
    question: str,
    debug_info: RetrievalDebugInfo,
    route: str,
    answer_truncated: str,
) -> None:
    """
    Log retrieval statistics at INFO level for monitoring.
    Keeps the log concise — full debug info is in the /debug endpoint.
    """
    logger.info(
        "RAG | route=%s rewrite=%s embed=%s rerank=%s "
        "candidates=%d selected=%d "
        "rewrite_ms=%.0f retrieve_ms=%.0f rerank_ms=%.0f | q=%r",
        route,
        debug_info.rewrite_method,
        debug_info.embedding_provider,
        debug_info.reranker_provider,
        debug_info.n_candidates,
        debug_info.n_selected,
        debug_info.timing_ms.get("rewrite", 0),
        debug_info.timing_ms.get("retrieve", 0),
        debug_info.timing_ms.get("rerank", 0),
        question[:80],
    )


def build_debug_info(
    rewritten: "RewrittenQuery",
    candidates: list["RetrievalResult"],
    selected: list["RetrievalResult"],
    embedding_provider: str,
    reranker_provider: str,
    timing: dict[str, float],
) -> RetrievalDebugInfo:
    """Construct a RetrievalDebugInfo from pipeline outputs."""
    selected_ids = {r.id for r in selected}
    chunk_infos = [
        ChunkDebugInfo(
            content=r.content,
            source_type=r.source_type,
            source_id=r.source_id,
            vector_score=r.vector_score,
            keyword_score=r.keyword_score,
            combined_score=r.combined_score,
            rerank_score=r.rerank_score,
            selected=r.id in selected_ids,
        )
        for r in candidates
    ]
    # Put selected chunks first for readability
    chunk_infos.sort(key=lambda c: (not c.selected, -(c.rerank_score or c.combined_score)))

    return RetrievalDebugInfo(
        original_query=rewritten.original,
        rewritten_query=rewritten.rewritten,
        rewrite_method=rewritten.method,
        embedding_provider=embedding_provider,
        reranker_provider=reranker_provider,
        n_candidates=len(candidates),
        n_selected=len(selected),
        candidates=chunk_infos,
        timing_ms=timing,
    )

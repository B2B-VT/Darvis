"""
app/rag/reranker.py

Two-stage reranking for retrieved chunks:

  Stage 1 (retrieval): Hybrid search returns top-K candidates (default 20).
  Stage 2 (rerank): Reranker selects top-N most relevant chunks (default 5).

Provider priority:
  1. Cohere Rerank API    (needs COHERE_API_KEY — free tier: 1,000 calls/month)
  2. Cross-encoder model  (local, sentence-transformers — already in venv)
  3. Score passthrough    (no reranking, use combined_score from retrieval)

Why rerank?
  Retrieval scores (cosine similarity, BM25) measure surface similarity.
  A cross-encoder reads both the query and each candidate together and
  assigns a true relevance score, dramatically improving top-N precision.

  For Darvis: "which CS 3114 prof is hardest?" → retrieval may surface
  CS 3114 course catalog docs ahead of grade docs. The reranker knows
  that grade data (GPA, F rate) is more relevant to "hardest" than the
  course title/credits blurb.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.rag.retriever import RetrievalResult

logger = logging.getLogger("darvis.reranker")

_CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"


class Reranker:
    """
    Reranks a list of RetrievalResult objects against the original query.
    Falls back gracefully through provider tiers.
    """

    def __init__(self, settings=None):
        from app.config import get_settings
        cfg = settings or get_settings()

        self._top_k: int = getattr(cfg, "rag_top_k_rerank", 5)
        self._provider: str = "passthrough"
        self._cohere_client = None
        self._cross_encoder = None

        cohere_key = getattr(cfg, "cohere_api_key", "")
        if cohere_key:
            client = self._init_cohere(cohere_key)
            if client:
                self._cohere_client = client
                self._provider = "cohere"
                logger.info("[reranker] Provider: Cohere Rerank")

        # Local cross-encoder disabled by default — avoids loading ~85 MB
        # sentence-transformers model on Render free tier (512 MB RAM limit).
        # Set RAG_ENABLE_LOCAL_RERANKER=true locally or on a paid-tier deployment.
        if self._provider == "passthrough":
            enable_local = getattr(cfg, "rag_enable_local_reranker", False)
            if enable_local:
                ce = self._init_cross_encoder()
                if ce:
                    self._cross_encoder = ce
                    self._provider = "cross_encoder"
                    logger.info("[reranker] Provider: cross-encoder %s (local)", _CROSS_ENCODER_MODEL)
            else:
                logger.info("[reranker] Local cross-encoder skipped (RAG_ENABLE_LOCAL_RERANKER=false)")

        if self._provider == "passthrough":
            logger.info("[reranker] Provider: passthrough (sorted by retrieval score)")

    # ── Provider initializers ──────────────────────────────────────────────────

    def _init_cohere(self, api_key: str):
        try:
            import cohere
            return cohere.Client(api_key=api_key)
        except ImportError:
            logger.debug("[reranker] cohere package not installed")
            return None

    def _init_cross_encoder(self):
        try:
            from sentence_transformers import CrossEncoder
            return CrossEncoder(_CROSS_ENCODER_MODEL, max_length=512)
        except ImportError:
            logger.debug("[reranker] sentence-transformers not installed")
            return None
        except Exception as exc:
            logger.warning("[reranker] cross-encoder load failed: %s", exc)
            return None

    # ── Public API ─────────────────────────────────────────────────────────────

    @property
    def provider(self) -> str:
        return self._provider

    def rerank(
        self,
        query: str,
        candidates: list["RetrievalResult"],
        top_k: int | None = None,
    ) -> list["RetrievalResult"]:
        """
        Rerank `candidates` by relevance to `query` and return the top_k best.
        Attaches `rerank_score` to each result for observability.
        Falls back to score passthrough if the reranker is unavailable.
        """
        if not candidates:
            return []
        k = top_k or self._top_k

        try:
            if self._provider == "cohere":
                return self._rerank_cohere(query, candidates, k)
            if self._provider == "cross_encoder":
                return self._rerank_cross_encoder(query, candidates, k)
        except Exception as exc:
            logger.error("[reranker] rerank() failed (%s): %s — using passthrough", self._provider, exc)

        return self._passthrough(candidates, k)

    # ── Provider implementations ───────────────────────────────────────────────

    def _rerank_cohere(
        self,
        query: str,
        candidates: list["RetrievalResult"],
        top_k: int,
    ) -> list["RetrievalResult"]:
        import cohere
        documents = [c.content for c in candidates]
        response = self._cohere_client.rerank(
            model="rerank-english-v3.0",
            query=query,
            documents=documents,
            top_n=top_k,
        )
        results = []
        for item in response.results:
            r = candidates[item.index]
            r.rerank_score = float(item.relevance_score)
            results.append(r)
        return results

    def _rerank_cross_encoder(
        self,
        query: str,
        candidates: list["RetrievalResult"],
        top_k: int,
    ) -> list["RetrievalResult"]:
        pairs = [(query, c.content) for c in candidates]
        scores = self._cross_encoder.predict(pairs)
        for c, s in zip(candidates, scores):
            c.rerank_score = float(s)
        ranked = sorted(candidates, key=lambda x: x.rerank_score or 0.0, reverse=True)
        return ranked[:top_k]

    def _passthrough(
        self,
        candidates: list["RetrievalResult"],
        top_k: int,
    ) -> list["RetrievalResult"]:
        sorted_by_combined = sorted(
            candidates,
            key=lambda x: x.combined_score,
            reverse=True,
        )
        for r in sorted_by_combined[:top_k]:
            r.rerank_score = r.combined_score
        return sorted_by_combined[:top_k]

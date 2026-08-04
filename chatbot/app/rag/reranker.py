"""
app/rag/reranker.py

Feature-flagged reranking for retrieved chunks.

Default behavior remains RRF passthrough: sort the initial hybrid-retrieval
candidate pool by `combined_score` and select top-k. When explicitly enabled,
the local cross-encoder reranker may reorder that same input pool, but it never
adds candidates and falls back to the original RRF order on any load/inference
problem.
"""

from __future__ import annotations

import logging
import math
import time
from dataclasses import replace
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from app.rag.retriever import RetrievalResult

logger = logging.getLogger("darvis.reranker")

DEFAULT_CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-TinyBERT-L2-v2"

_GRADE_QUERY_SIGNALS = (
    "easy", "easiest", "hard", "hardest", "brutal", "tough", "avoid",
    "gpa", "grade", "grades", "outcome", "outcomes", "a rate", "f rate",
    "withdraw", "workload", "difficulty", "professor", "instructor",
)


def _clean(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text or text.lower() in {"none", "null", "nan", "n/a"}:
        return ""
    return text


def candidate_stable_id(candidate: "RetrievalResult") -> str:
    source_id = _clean(getattr(candidate, "source_id", ""))
    if source_id:
        return source_id
    return str(getattr(candidate, "id", ""))


def query_mentions_grade_context(query: str) -> bool:
    q = (query or "").lower()
    return any(signal in q for signal in _GRADE_QUERY_SIGNALS)


def canonical_candidate_text(candidate: "RetrievalResult", query: str = "") -> str:
    """
    Build a compact reranker input string from trusted chunk metadata.

    General topical course recommendations avoid grade-outcome fields so the
    cross-encoder ranks semantic fit instead of "easy A" artifacts. Grade and
    professor fields are included for queries that explicitly ask for outcomes,
    difficulty, or instructor comparison.
    """
    meta = getattr(candidate, "metadata", None) or {}
    source_type = _clean(getattr(candidate, "source_type", ""))
    content = _clean(getattr(candidate, "content", ""))
    include_grade_context = query_mentions_grade_context(query)
    parts: list[str] = []

    subject = _clean(meta.get("subject"))
    course_number = _clean(meta.get("course_number"))
    title = _clean(meta.get("title") or meta.get("course_title"))
    description = _clean(meta.get("description"))
    topics = _clean(meta.get("topics") or meta.get("pathways"))
    credits = _clean(meta.get("credits"))
    prereqs = _clean(meta.get("prerequisites"))
    instructor = _clean(meta.get("instructor") or meta.get("name") or meta.get("professor"))

    if source_type == "course" or subject or course_number or title:
        if subject and course_number:
            parts.append(f"Course: {subject} {course_number}")
        if title:
            parts.append(f"Title: {title}")
        if subject:
            parts.append(f"Subject: {subject}")
        if description:
            parts.append(f"Description: {description}")
        if topics:
            parts.append(f"Topics: {topics}")
        if course_number and course_number[:1].isdigit():
            parts.append(f"Level: {course_number[0]}000")
        if credits:
            parts.append(f"Credits: {credits}")
        if prereqs:
            parts.append(f"Prerequisites: {prereqs}")

    if source_type in {"grade", "instructor", "section"} or include_grade_context:
        if instructor:
            parts.append(f"Professor: {instructor}")
        if subject and course_number:
            parts.append(f"Course taught: {subject} {course_number}")
        if include_grade_context:
            avg_gpa = _clean(meta.get("avg_gpa") or meta.get("gpa"))
            sample = _clean(meta.get("sample_size") or meta.get("total_students") or meta.get("graded_enrollment"))
            rating_count = _clean(meta.get("rmp_count") or meta.get("rating_count"))
            difficulty = _clean(meta.get("rmp_difficulty") or meta.get("difficulty"))
            if avg_gpa:
                parts.append(f"Average GPA: {avg_gpa}")
            if sample:
                parts.append(f"Student sample size: {sample}")
            if rating_count:
                parts.append(f"Rating count: {rating_count}")
            if difficulty:
                parts.append(f"Difficulty: {difficulty}")

    if not parts and content:
        parts.append(content)
    elif content and content not in " ".join(parts):
        parts.append(f"Context: {content}")

    return "\n".join(part for part in parts if _clean(part))


def normalized_reranker_query(
    query: str,
    user_profile: dict[str, Any] | None = None,
    intent: str | None = None,
    constraints: list[str] | None = None,
) -> str:
    parts = [f"User request: {_clean(query)}"]
    if intent:
        parts.append(f"Intent: {_clean(intent)}")
    profile = user_profile or {}
    major = _clean(profile.get("major"))
    minor = _clean(profile.get("minor"))
    interests = profile.get("interests") or []
    if major:
        parts.append(f"Major: {major}")
    if minor:
        parts.append(f"Minor: {minor}")
    if interests:
        clean_interests = [_clean(item) for item in interests]
        clean_interests = [item for item in clean_interests if item]
        if clean_interests:
            parts.append(f"Interests: {', '.join(clean_interests[:8])}")
    if constraints:
        clean_constraints = [_clean(item) for item in constraints]
        clean_constraints = [item for item in clean_constraints if item]
        if clean_constraints:
            parts.append(f"Constraints: {'; '.join(clean_constraints[:8])}")
    return "\n".join(parts)


class Reranker:
    """
    Reranks RetrievalResult objects against the query.

    The local cross-encoder is loaded lazily on first use and cached on this
    instance. Any failure, including non-finite model scores, records fallback
    metadata and preserves original RRF ordering.
    """

    def __init__(self, settings=None):
        from app.config import get_settings
        cfg = settings or get_settings()

        self._top_k: int = getattr(cfg, "rag_rerank_top_k", getattr(cfg, "rag_top_k_rerank", 5))
        self._provider: str = "passthrough"
        self._configured_provider: str = "passthrough"
        self._cohere_client = None
        self._cross_encoder = None
        self._local_model_name: str = getattr(cfg, "rag_local_reranker_model", DEFAULT_CROSS_ENCODER_MODEL)
        self._local_device: str = getattr(cfg, "rag_local_reranker_device", "cpu") or "cpu"
        self._batch_size: int = max(1, int(getattr(cfg, "rag_rerank_batch_size", 16) or 16))
        self._timeout_ms: int = max(0, int(getattr(cfg, "rag_rerank_timeout_ms", 0) or 0))
        self._last_ranking_trace: dict[str, Any] = self._empty_trace("rrf_passthrough", enabled=False)
        self._last_all_scores: dict[str, float] = {}

        cohere_key = getattr(cfg, "cohere_api_key", "")
        if cohere_key:
            client = self._init_cohere(cohere_key)
            if client:
                self._cohere_client = client
                self._provider = "cohere"
                self._configured_provider = "cohere"
                logger.info("[reranker] Provider: Cohere Rerank")

        if self._provider == "passthrough":
            enable_local = getattr(cfg, "rag_enable_local_reranker", False)
            if enable_local:
                self._provider = "cross_encoder"
                self._configured_provider = "cross_encoder"
                logger.info("[reranker] Provider: local cross-encoder %s (lazy)", self._local_model_name)
            else:
                logger.info("[reranker] Local cross-encoder skipped (RAG_ENABLE_LOCAL_RERANKER=false)")

        if self._provider == "passthrough":
            logger.info("[reranker] Provider: passthrough (sorted by retrieval score)")

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def configured_provider(self) -> str:
        return self._configured_provider

    @property
    def last_ranking_trace(self) -> dict[str, Any]:
        return dict(self._last_ranking_trace)

    def rerank(
        self,
        query: str,
        candidates: list["RetrievalResult"],
        top_k: int | None = None,
        user_profile: dict[str, Any] | None = None,
        intent: str | None = None,
    ) -> list["RetrievalResult"]:
        if not candidates:
            self._last_all_scores = {}
            self._last_ranking_trace = self._empty_trace(self._method_name(), enabled=self._provider != "passthrough")
            return []

        k = min(top_k or self._top_k, len(candidates))
        rerank_query = normalized_reranker_query(query, user_profile=user_profile, intent=intent)
        start = time.perf_counter()

        try:
            if self._provider == "cohere":
                selected = self._rerank_cohere(rerank_query, candidates, k)
                self._record_trace(
                    method="cohere",
                    model="rerank-english-v3.0",
                    enabled=True,
                    candidates=candidates,
                    selected=selected,
                    latency_ms=(time.perf_counter() - start) * 1000,
                )
                return selected
            if self._provider == "cross_encoder":
                selected = self._rerank_cross_encoder(rerank_query, candidates, k)
                self._record_trace(
                    method="local_cross_encoder",
                    model=self._local_model_name,
                    enabled=True,
                    candidates=candidates,
                    selected=selected,
                    latency_ms=(time.perf_counter() - start) * 1000,
                )
                return selected
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            logger.error("[reranker] rerank() failed (%s): %s — using passthrough", self._provider, exc)
            selected = self._passthrough(candidates, k)
            self._record_trace(
                method=self._method_name(),
                model=self._local_model_name if self._provider == "cross_encoder" else None,
                enabled=self._provider != "passthrough",
                candidates=candidates,
                selected=selected,
                latency_ms=(time.perf_counter() - start) * 1000,
                fallback_used=True,
                fallback_reason=reason,
            )
            return selected

        selected = self._passthrough(candidates, k)
        self._record_trace(
            method="rrf_passthrough",
            model=None,
            enabled=False,
            candidates=candidates,
            selected=selected,
            latency_ms=(time.perf_counter() - start) * 1000,
        )
        return selected

    def _init_cohere(self, api_key: str):
        try:
            import cohere
            return cohere.Client(api_key=api_key)
        except ImportError:
            logger.debug("[reranker] cohere package not installed")
            return None

    def _load_cross_encoder(self):
        if self._cross_encoder is not None:
            return self._cross_encoder
        try:
            from sentence_transformers import CrossEncoder
            self._cross_encoder = CrossEncoder(
                self._local_model_name,
                max_length=512,
                device=self._local_device,
            )
            return self._cross_encoder
        except ImportError as exc:
            raise RuntimeError("sentence-transformers not installed") from exc
        except Exception as exc:
            raise RuntimeError(f"cross-encoder load failed: {exc}") from exc

    def _rerank_cohere(
        self,
        query: str,
        candidates: list["RetrievalResult"],
        top_k: int,
    ) -> list["RetrievalResult"]:
        documents = [canonical_candidate_text(c, query) for c in candidates]
        response = self._cohere_client.rerank(
            model="rerank-english-v3.0",
            query=query,
            documents=documents,
            top_n=top_k,
        )
        results = []
        for item in response.results:
            r = replace(candidates[item.index], rerank_score=float(item.relevance_score))
            results.append(r)
        return results

    def _rerank_cross_encoder(
        self,
        query: str,
        candidates: list["RetrievalResult"],
        top_k: int,
    ) -> list["RetrievalResult"]:
        model = self._load_cross_encoder()
        texts = [canonical_candidate_text(c, query) for c in candidates]
        pairs = [(query, text) for text in texts]
        predict_kwargs = {"batch_size": self._batch_size} if self._batch_size else {}
        scores = model.predict(pairs, **predict_kwargs)
        scored: list[tuple[int, "RetrievalResult"]] = []
        all_scores: dict[str, float] = {}
        for idx, (candidate, score) in enumerate(zip(candidates, scores)):
            value = float(score)
            if not math.isfinite(value):
                raise RuntimeError("cross-encoder produced non-finite score")
            scored_candidate = replace(candidate, rerank_score=value)
            scored.append((idx, scored_candidate))
            all_scores[candidate_stable_id(candidate)] = value
        ranked = sorted(scored, key=lambda item: (-(item[1].rerank_score or 0.0), item[0]))
        self._last_all_scores = all_scores
        return [item[1] for item in ranked[:top_k]]

    def _passthrough(
        self,
        candidates: list["RetrievalResult"],
        top_k: int,
    ) -> list["RetrievalResult"]:
        scored = [
            (idx, replace(candidate, rerank_score=candidate.combined_score))
            for idx, candidate in enumerate(candidates)
        ]
        ranked = sorted(scored, key=lambda item: (-item[1].combined_score, item[0]))
        self._last_all_scores = {}
        return [item[1] for item in ranked[:top_k]]

    def _method_name(self) -> str:
        if self._provider == "cross_encoder":
            return "local_cross_encoder"
        if self._provider == "cohere":
            return "cohere"
        return "rrf_passthrough"

    def _empty_trace(self, method: str, enabled: bool) -> dict[str, Any]:
        return {
            "method": method,
            "model": self._local_model_name if method == "local_cross_encoder" else None,
            "enabled": enabled,
            "input_ids": [],
            "input_rrf_order": [],
            "cross_encoder_scores": {},
            "output_order": [],
            "selected_ids": [],
            "fallback_used": False,
            "fallback_reason": None,
            "latency_ms": 0.0,
        }

    def _record_trace(
        self,
        method: str,
        model: str | None,
        enabled: bool,
        candidates: list["RetrievalResult"],
        selected: list["RetrievalResult"],
        latency_ms: float,
        fallback_used: bool = False,
        fallback_reason: str | None = None,
    ) -> None:
        input_ids = [candidate_stable_id(c) for c in candidates]
        output_ids = [candidate_stable_id(c) for c in selected]
        scores = dict(self._last_all_scores) if method == "local_cross_encoder" and not fallback_used else {}
        trace = {
            "method": "rrf_passthrough" if fallback_used and method == "rrf_passthrough" else method,
            "model": model,
            "enabled": enabled,
            "input_ids": input_ids,
            "input_rrf_order": input_ids,
            "cross_encoder_scores": scores if method == "local_cross_encoder" and not fallback_used else {},
            "output_order": output_ids,
            "selected_ids": output_ids,
            "fallback_used": fallback_used,
            "fallback_reason": fallback_reason,
            "latency_ms": round(latency_ms, 1),
        }
        self._last_ranking_trace = trace

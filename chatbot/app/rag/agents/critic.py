"""
app/rag/agents/critic.py

Retrieval Critic Agent — evaluates whether retrieved results are good enough
to answer the user's question. Pure heuristics, no LLM. Fast.

Scoring factors:
  1. Candidate count
  2. Top score (normalized per provider — cross-encoder logits vs 0-1 Cohere/cosine)
  3. Entity coverage (if "CS 3114" mentioned, is it in results?)

Decision:
  ACCEPT  — quality sufficient, proceed to answer generation
  RETRY   — quality weak, try a different retrieval strategy
  FAIL    — exhausted attempts, return best available or "not enough info"
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.rag.retriever import RetrievalResult
    from app.rag.agents.planner import QueryPlan

logger = logging.getLogger("darvis.agents.critic")

_THRESHOLD_GOOD = 0.35
_THRESHOLD_WEAK = 0.08


@dataclass
class CritiqueResult:
    decision: str        # "ACCEPT" | "RETRY" | "FAIL"
    quality_score: float
    reason: str
    attempt: int


class RetrievalCriticAgent:
    """Evaluates retrieval quality and decides whether to accept, retry, or fail."""

    def evaluate(
        self,
        question: str,
        results: list["RetrievalResult"],
        plan: "QueryPlan",
        attempt: int,
        max_attempt: int,
    ) -> CritiqueResult:
        if not results:
            if attempt >= max_attempt:
                return CritiqueResult("FAIL", 0.0, "no results after all retries", attempt)
            return CritiqueResult("RETRY", 0.0, "no candidates retrieved", attempt)

        quality = self._score(results)
        penalty = self._entity_penalty(results, plan)
        adjusted = quality * (1.0 - penalty * 0.3)

        logger.info(
            "[critic] attempt=%d n=%d quality=%.3f penalty=%.2f adjusted=%.3f",
            attempt, len(results), quality, penalty, adjusted,
        )

        if adjusted >= _THRESHOLD_GOOD:
            return CritiqueResult("ACCEPT", adjusted, f"quality={adjusted:.2f}", attempt)

        if attempt >= max_attempt:
            if adjusted > _THRESHOLD_WEAK:
                # Marginally acceptable — accept best-effort on last attempt
                return CritiqueResult("ACCEPT", adjusted, f"best available after {attempt+1} attempts", attempt)
            return CritiqueResult("FAIL", adjusted, f"quality={adjusted:.2f} below minimum", attempt)

        return CritiqueResult("RETRY", adjusted, f"quality={adjusted:.2f} < {_THRESHOLD_GOOD}", attempt)

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _score(self, results: list["RetrievalResult"]) -> float:
        rerank_scores = [r.rerank_score for r in results if r.rerank_score is not None]

        if rerank_scores:
            top = max(rerank_scores)
            # Cross-encoder logits range ~-10 to +10; Cohere scores are 0-1.
            if top > 1.5 or min(rerank_scores) < 0:
                normalized = 1.0 / (1.0 + math.exp(-top / 3.0))
            else:
                normalized = top
        else:
            combined = [r.combined_score for r in results]
            top = max(combined) if combined else 0.0
            # RRF scores are tiny (0.01-0.05); cosine scores are 0-1.
            normalized = min(top * 5, 1.0) if top < 0.1 else top

        n_factor = min(len(results) / 5.0, 1.0)
        return normalized * 0.7 + n_factor * 0.3

    def _entity_penalty(self, results: list["RetrievalResult"], plan: "QueryPlan") -> float:
        """Return 0.7 penalty if a specifically mentioned course is absent from results."""
        mentioned = getattr(plan, "mentioned_course", None)
        if not mentioned:
            return 0.0

        needle = mentioned.lower().replace(" ", "")
        for r in results:
            content = r.content.lower().replace(" ", "")
            src_id = (r.source_id or "").lower().replace(" ", "")
            meta = r.metadata or {}
            composite = (str(meta.get("subject", "")) + str(meta.get("course_number", ""))).lower()
            if needle in content or needle in src_id or needle in composite:
                return 0.0

        logger.info("[critic] entity '%s' absent from results — penalty applied", mentioned)
        return 0.7

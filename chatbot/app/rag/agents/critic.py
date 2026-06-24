"""
app/rag/agents/critic.py

Retrieval Critic Agent — evaluates whether retrieved results are good enough
to answer the user's question.

Scoring factors (pure heuristics, no LLM, fast):
  1. Candidate count
  2. Top score (normalized per provider — cross-encoder logits vs 0-1 Cohere/cosine)
  3. Entity coverage (if "CS 3114" mentioned, is it in results?)

Decision:
  ACCEPT  — quality sufficient, proceed to answer generation
  RETRY   — quality weak, try a different retrieval strategy
  FAIL    — exhausted attempts, return "" so the caller answers from the
            LLM's own knowledge instead of weak/irrelevant RAG context

LLM-judgement fallback:
  On the final attempt, a borderline heuristic score (above _THRESHOLD_WEAK
  but below _THRESHOLD_GOOD) used to auto-ACCEPT as "best available" — even
  when the context didn't actually address the question. Now it asks the
  LLM client (if one was provided) a direct yes/no: does this context answer
  the question? This is the one explicit LLM-judgement call in the pipeline,
  and it only fires on the borderline path — clear hits and clear misses
  never pay for it.
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

    def __init__(self, llm_client=None):
        # llm_client is the GemmaAnswerClient instance (has judge_relevance()).
        # None is valid — the critic just skips the LLM-judgement step and
        # falls back to the old heuristic-only "best available" behavior.
        self._llm = llm_client

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
                # Borderline — don't blindly accept "best available" anymore.
                # Ask the LLM whether this context actually answers the question.
                verdict = self._judge(question, results)
                if verdict is True:
                    return CritiqueResult(
                        "ACCEPT", adjusted, f"llm-judged useful (heuristic={adjusted:.2f})", attempt
                    )
                if verdict is False:
                    return CritiqueResult(
                        "FAIL", adjusted, f"llm-judged not useful (heuristic={adjusted:.2f})", attempt
                    )
                # verdict is None: no LLM client, judge disabled, or judge call
                # failed — fall back to the old heuristic-only behavior so a
                # missing/broken LLM never blocks an otherwise-working RAG path.
                return CritiqueResult("ACCEPT", adjusted, f"best available after {attempt+1} attempts", attempt)
            return CritiqueResult("FAIL", adjusted, f"quality={adjusted:.2f} below minimum", attempt)

        return CritiqueResult("RETRY", adjusted, f"quality={adjusted:.2f} < {_THRESHOLD_GOOD}", attempt)

    def _judge(self, question: str, results: list["RetrievalResult"]) -> bool | None:
        """
        Ask the LLM whether the retrieved context answers the question.
        Returns None (undetermined) if there's no LLM client, the judge is
        disabled via config, or the call itself fails — callers treat None
        as "couldn't determine" and fall back to heuristic-only behavior.
        """
        if self._llm is None:
            return None
        try:
            from app.config import get_settings
            if not getattr(get_settings(), "rag_enable_llm_judge", True):
                return None
        except Exception:
            pass

        context = "\n\n".join(r.content for r in results[:5] if r.content)
        if not context:
            return False

        try:
            return self._llm.judge_relevance(question, context)
        except Exception as exc:
            logger.warning("[critic] LLM judge call failed: %s", exc)
            return None

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

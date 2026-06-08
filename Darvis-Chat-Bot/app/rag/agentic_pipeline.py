"""
app/rag/agentic_pipeline.py

Agentic RAG Pipeline — wraps RAGPipeline with a plan → retrieve → critique
self-correction loop.

Flow:
  [QueryPlannerAgent] → retrieve → [CriticAgent]
                                        │ RETRY (max 2)
                                        └─► replan → retrieve → [CriticAgent]
                                        │ ACCEPT
                                        └─► return context
                                        │ FAIL
                                        └─► return best-effort context

Structured logging at every step:
  [agentic] step=plan   source_filter=grade alpha=0.70 intent=grade
  [agentic] step=retrieve attempt=0 n=15 top_rerank=4.21 top_combined=0.031
  [agentic] step=critique attempt=0 decision=RETRY quality=0.22 reason=...
  [agentic] step=replan  attempt=1 source=None alpha=0.50
  [agentic] step=result  decision=ACCEPT attempts=2
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.rag.agents.planner import QueryPlannerAgent
from app.rag.agents.critic import RetrievalCriticAgent

if TYPE_CHECKING:
    from app.rag.pipeline import RAGPipeline

logger = logging.getLogger("darvis.agentic_pipeline")

_MAX_ATTEMPTS = 3  # 1 initial + 2 retries


class AgenticRAGPipeline:
    """
    Agentic wrapper around RAGPipeline. Adds planning, critique, and
    self-correction without touching the base pipeline internals.

    Same question-in / context-string-out contract as RAGPipeline.retrieve().
    """

    def __init__(self, base_pipeline: "RAGPipeline"):
        self._base = base_pipeline
        self._planner = QueryPlannerAgent()
        self._critic = RetrievalCriticAgent()
        logger.info("[agentic_pipeline] ready (max_attempts=%d)", _MAX_ATTEMPTS)

    # ── Public API ─────────────────────────────────────────────────────────────

    def retrieve(self, question: str, n_results: int = 10, route: str = "unknown") -> str:
        """
        Agentic retrieval with self-correction loop.
        Returns a formatted context string. Never raises.
        """
        if not question or not question.strip():
            return ""

        plan = self._planner.plan(question)
        logger.info(
            "[agentic] step=plan source_filter=%s alpha=%.2f intent=%s",
            plan.source_filter, plan.alpha, plan.intent_type,
        )

        best_context = ""
        best_quality = -1.0

        for attempt in range(_MAX_ATTEMPTS):
            context, results = self._base.retrieve_full(
                question,
                n_results=n_results,
                source_filter=plan.source_filter,
                alpha=plan.alpha,
                route=route,
            )

            top_rerank = max(
                (r.rerank_score for r in results if r.rerank_score is not None), default=None
            )
            top_combined = max((r.combined_score for r in results), default=0.0)
            logger.info(
                "[agentic] step=retrieve attempt=%d n=%d top_rerank=%s top_combined=%.3f",
                attempt, len(results),
                f"{top_rerank:.3f}" if top_rerank is not None else "n/a",
                top_combined,
            )

            # Keep track of best result across all attempts
            if results and top_combined > best_quality:
                best_context = context
                best_quality = top_combined

            critique = self._critic.evaluate(
                question, results, plan,
                attempt=attempt, max_attempt=_MAX_ATTEMPTS - 1,
            )
            logger.info(
                "[agentic] step=critique attempt=%d decision=%s quality=%.3f reason=%s",
                attempt, critique.decision, critique.quality_score, critique.reason,
            )

            if critique.decision == "ACCEPT":
                logger.info("[agentic] step=result decision=ACCEPT attempts=%d", attempt + 1)
                return context

            if critique.decision == "FAIL":
                logger.info(
                    "[agentic] step=result decision=FAIL attempts=%d has_best_effort=%s",
                    attempt + 1, bool(best_context),
                )
                return best_context

            # RETRY: replan and loop
            plan = self._planner.replan(question, plan, attempt=attempt + 1)
            logger.info(
                "[agentic] step=replan attempt=%d source=%s alpha=%.2f",
                attempt + 1, plan.source_filter, plan.alpha,
            )

        logger.info(
            "[agentic] step=result decision=EXHAUSTED attempts=%d has_best_effort=%s",
            _MAX_ATTEMPTS, bool(best_context),
        )
        return best_context

    def status(self) -> dict:
        s = self._base.status()
        s["agentic"] = True
        s["max_attempts"] = _MAX_ATTEMPTS
        return s

    @property
    def last_debug_info(self):
        return self._base.last_debug_info

    @property
    def retriever(self):
        return self._base.retriever

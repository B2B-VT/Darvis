"""
app/rag/agents/planner.py

Query Planning Agent — decides retrieval strategy before each attempt.

Determines:
  - which Supabase source type to target (grade/course/requirement/instructor)
  - vector vs keyword weight (alpha)
  - how to reformulate the query on retries

Rule-based (no LLM calls) to keep it fast. The query_rewriter handles
LLM-based query optimization separately; the planner handles strategy.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

logger = logging.getLogger("darvis.agents.planner")

# Ordered most-specific → least-specific so earlier rules win
_SOURCE_RULES: list[tuple[str, str]] = [
    ("requirement", r"\b(require|requirement|degree|major|graduate|graduation|need for|needed|fulfill|curriculum|what courses do i need)\b"),
    ("instructor",  r"\b(rating|rmp|rate my professor|review|reputation)\b"),
    ("grade",       r"\b(gpa|grade|f rate|a rate|fail|pass|withdraw|professor|instructor|teach|prof|hardest|easiest|brutal|tough|avoid|outcomes)\b"),
    ("course",      r"\b(course|class|description|credits?|prereq|prerequisite|offered|syllabus|about the class|what is)\b"),
]

_COURSE_CODE_RE = re.compile(r"\b([A-Z]{2,4})\s*(\d{4})\b")
_SEMANTIC_BOOST_RE = re.compile(r"\b(best|worst|hardest|easiest|recommend|brutal|tough|safe|risky)\b", re.I)
_EXACT_ID_RE = re.compile(r"\b[A-Z]{2,4}\s*\d{4}\b")
_PROF_HINT_RE = re.compile(r"\b(?:prof(?:essor)?|instructor|teacher)\s+([A-Z][a-z]+)\b", re.I)


@dataclass
class QueryPlan:
    primary_query: str
    source_filter: str | None = None   # "grade" | "course" | "requirement" | "instructor" | None
    alpha: float = 0.7                 # 1.0 = pure semantic, 0.0 = pure keyword
    intent_type: str = "general"
    mentioned_course: str | None = None
    mentioned_instructor: str | None = None


class QueryPlannerAgent:
    """Produces a retrieval plan from the raw user question. No LLM — always fast."""

    def plan(self, question: str) -> QueryPlan:
        q_upper = question.upper()
        q_lower = question.lower()

        source_filter = self._detect_source_filter(q_lower)
        # Course codes in original case for pattern matching
        if source_filter == "grade" or (source_filter is None and _EXACT_ID_RE.search(q_upper)):
            source_filter = "grade"

        alpha = self._detect_alpha(q_lower, q_upper)
        mentioned_course = self._extract_course(q_upper)
        mentioned_instructor = self._extract_instructor(question)

        plan = QueryPlan(
            primary_query=question,
            source_filter=source_filter,
            alpha=alpha,
            intent_type=source_filter or "general",
            mentioned_course=mentioned_course,
            mentioned_instructor=mentioned_instructor,
        )
        logger.info(
            "[planner] plan source=%s alpha=%.2f course=%s instr=%s",
            plan.source_filter, plan.alpha, plan.mentioned_course, plan.mentioned_instructor,
        )
        return plan

    def replan(self, question: str, prev_plan: QueryPlan, attempt: int) -> QueryPlan:
        """Widen search strategy on successive retry attempts."""
        if attempt == 1:
            # Drop source_filter, give keywords more weight
            new_plan = QueryPlan(
                primary_query=question,
                source_filter=None,
                alpha=max(0.4, prev_plan.alpha - 0.2),
                intent_type=prev_plan.intent_type + "_r1",
                mentioned_course=prev_plan.mentioned_course,
                mentioned_instructor=prev_plan.mentioned_instructor,
            )
        else:
            # Keyword-dominant, no filter
            new_plan = QueryPlan(
                primary_query=question,
                source_filter=None,
                alpha=0.2,
                intent_type=prev_plan.intent_type + "_r2",
                mentioned_course=prev_plan.mentioned_course,
                mentioned_instructor=prev_plan.mentioned_instructor,
            )
        logger.info(
            "[planner] replan attempt=%d source=%s alpha=%.2f",
            attempt, new_plan.source_filter, new_plan.alpha,
        )
        return new_plan

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _detect_source_filter(self, q_lower: str) -> str | None:
        for source, pattern in _SOURCE_RULES:
            if re.search(pattern, q_lower):
                return source
        return None

    def _detect_alpha(self, q_lower: str, q_upper: str) -> float:
        if _EXACT_ID_RE.search(q_upper):
            return 0.6  # exact course code → give keywords more weight
        if _SEMANTIC_BOOST_RE.search(q_lower):
            return 0.8  # vague semantic intent → lean on vectors
        return 0.7

    def _extract_course(self, q_upper: str) -> str | None:
        m = _COURSE_CODE_RE.search(q_upper)
        return f"{m.group(1)} {m.group(2)}" if m else None

    def _extract_instructor(self, question: str) -> str | None:
        m = _PROF_HINT_RE.search(question)
        return m.group(1) if m else None

"""
app/rag/query_rewriter.py

Query rewriting before retrieval. Transforms vague or complex user questions
into queries that retrieve better chunks from the vector store.

Why rewrite?
  A student asking "is Hamouda good for algorithms?" retrieves better docs
  when rewritten as "CS 3114 Hamouda grade GPA A rate F rate outcome".
  The rewritten form matches the vocabulary used in the embedded documents
  (grade records, course profiles) rather than the question vocabulary.

Strategy:
  1. LLM rewrite (Gemma answer_raw) — full semantic understanding, produces a
     search query in the embedding-space vocabulary. Capped at 3 seconds via
     a thread timeout so a slow LLM day doesn't block the full request.
  2. Rule-based expansion — fast, deterministic fallback using VT-specific
     course nickname lookups and metric synonyms. Multiple expansions are now
     combined (nickname + metric) instead of stopping at the first match.

The original query is also kept alongside the rewritten one. The retriever
can embed both and union the results, or just use the rewritten query.
"""

from __future__ import annotations

import concurrent.futures
import logging
import re
from dataclasses import dataclass

logger = logging.getLogger("darvis.query_rewriter")

# Common VT CS course nicknames → canonical course identifier keywords.
# When a user asks about a topic, these terms are appended to retrieval queries.
_COURSE_NICKNAMES: dict[str, str] = {
    "algorithms": "CS 3114 algorithms data structures",
    "data structures": "CS 2114 data structures",
    "systems software": "CS 3214 systems software",
    "software design": "CS 3704 software engineering design",
    "theory of computation": "CS 4504 theory computation automata",
    "computer organization": "CS 2506 computer organization assembly",
    "networks": "CS 4264 computer networks",
    "compilers": "CS 4205 compiler construction",
    "operating systems": "CS 3204 operating systems",
    "discrete math": "CS 2505 discrete mathematics",
    "intro to cs": "CS 1114 introduction computing",
    "intro programming": "CS 1064 intro programming",
    "software eng": "CS 3704 software engineering",
    "machine learning": "CS 4824 machine learning",
    "artificial intelligence": "CS 4804 artificial intelligence",
    "database": "CS 4604 database management systems",
    "computer graphics": "CS 4624 computer graphics",
    "linear algebra": "MATH 2114 linear algebra",
    "calc 1": "MATH 1225 calculus",
    "calc 2": "MATH 1226 calculus",
    "diff eq": "MATH 2214 differential equations",
    "statistics": "STAT 4105 statistical inference",
    "circuits": "ECE 2004 circuits",
}

# Metric synonyms — ALL matching entries are collected (not just the first).
_METRIC_EXPANSIONS: list[tuple[str, str]] = [
    ("hardest",      "F rate fail low GPA difficulty"),
    ("brutal",       "F rate fail low GPA difficulty"),
    ("tough",        "F rate fail low GPA"),
    ("easiest",      "high GPA A rate pass"),
    ("best outcomes","high GPA A rate"),
    ("worst outcomes","F rate fail low GPA"),
    ("avoid",        "F rate fail low GPA"),
    ("pass",         "A rate low F rate GPA"),
]

_REWRITE_PROMPT = """Convert this student question into an optimized retrieval query for a VT grade database.

Rules:
- Output keywords and phrases, NOT a full sentence
- Include relevant: course codes, instructor names, metrics (GPA, A rate, F rate)
- Expand academic concepts to their common terms
- For "best prof" questions include "GPA A rate outcomes"
- For "hardest" questions include "F rate GPA low difficulty"
- Keep it under 20 words
- Output ONLY the search query, nothing else

Student question: {question}
Search query:"""


@dataclass
class RewrittenQuery:
    """Result of query rewriting, carrying both forms for observability."""
    original: str
    rewritten: str
    method: str  # "llm" | "rules" | "passthrough"


class QueryRewriter:
    """
    Rewrites user questions into retrieval-optimized queries.
    Uses Gemma when available; falls back to rule-based expansion.
    """

    def __init__(self, llm_client=None, settings=None):
        from app.config import get_settings
        cfg = settings or get_settings()
        self._llm = llm_client
        self._enabled: bool = getattr(cfg, "rag_enable_query_rewrite", True)
        # Per-request timeout for LLM rewriting — keeps total latency bounded.
        # The LLM HTTP client has a 30s global timeout; we cap rewriting at 3s.
        self._timeout_s: float = getattr(cfg, "rag_rewrite_timeout_s", 3.0)

    def set_llm(self, llm) -> None:
        """Attach or replace the LLM client after construction."""
        self._llm = llm

    def rewrite(self, question: str) -> RewrittenQuery:
        """
        Returns a RewrittenQuery with the best available rewrite.
        Never raises — falls back to passthrough on any error.
        """
        if not self._enabled:
            return RewrittenQuery(question, question, "passthrough")

        # Rule-based expansion first (fast, always available, combines all matches)
        rule_expanded = self._rule_expand(question)

        # LLM rewrite: better quality but bounded to _timeout_s via thread pool.
        # We use answer_raw() (no system prompt, no sanitization) — this is a
        # keyword extraction task, not a prose generation task.
        if self._llm is not None:
            llm_query = self._llm_rewrite_with_timeout(question, self._timeout_s)
            if llm_query and len(llm_query.strip()) > 3:
                rewritten = llm_query.strip()
                # Append any rule-based nickname/metric expansions not already covered
                if rule_expanded != question:
                    extra = " ".join(
                        w for w in rule_expanded.split()
                        if w.lower() not in rewritten.lower()
                    )
                    if extra.strip():
                        rewritten = f"{rewritten} {extra.strip()}"
                return RewrittenQuery(question, rewritten, "llm")

        if rule_expanded != question:
            return RewrittenQuery(question, rule_expanded, "rules")

        return RewrittenQuery(question, question, "passthrough")

    def _llm_rewrite_with_timeout(self, question: str, timeout_s: float) -> str | None:
        """
        Call the LLM in a separate thread and return None if it doesn't
        respond within timeout_s.

        Uses answer_raw() (no system prompt) because we want raw keywords.

        NOTE: We avoid `with ThreadPoolExecutor() as executor:` because the context
        manager calls shutdown(wait=True) on exit — this blocks for the full HTTP
        timeout (30 s) even after catching TimeoutError. Instead, shutdown(wait=False)
        abandons the worker thread immediately so the request is unblocked.
        """
        prompt = _REWRITE_PROMPT.format(question=question)
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = executor.submit(self._llm.answer_raw, prompt, 50)
        try:
            result = future.result(timeout=timeout_s)
            executor.shutdown(wait=False)
            return result
        except concurrent.futures.TimeoutError:
            executor.shutdown(wait=False)
            logger.debug(
                "[query_rewriter] LLM rewrite timed out after %.1fs for: %r",
                timeout_s, question[:60],
            )
            return None
        except Exception as exc:
            executor.shutdown(wait=False)
            logger.debug("[query_rewriter] LLM rewrite failed: %s", exc)
            return None

    def _rule_expand(self, question: str) -> str:
        """
        Rule-based expansion using VT course nicknames and domain synonyms.

        Collects ALL matching expansions (not just the first) so a question like
        "which algorithms prof is the hardest?" gets both the nickname expansion
        (CS 3114) and the metric expansion (F rate fail low GPA) combined.
        """
        q_lower = question.lower()
        expansions: list[str] = []

        # Course nickname expansion — use first match to avoid bloat from
        # overlapping entries (e.g. "data structures" vs "data structures and algorithms")
        for nickname, expansion in _COURSE_NICKNAMES.items():
            if nickname in q_lower:
                expansions.append(expansion)
                break

        # Metric synonym expansions — collect ALL matches since they're additive
        for phrase, expansion in _METRIC_EXPANSIONS:
            if phrase in q_lower:
                expansions.append(expansion)

        if not expansions:
            return question

        return f"{question} {' '.join(expansions)}"

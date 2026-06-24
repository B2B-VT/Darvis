"""
Unit tests for QueryPlannerAgent and RetrievalCriticAgent.
Runs without any live services.
"""

import pytest

from app.rag.agents.planner import QueryPlannerAgent, QueryPlan
from app.rag.agents.critic import RetrievalCriticAgent
from app.rag.retriever import RetrievalResult


def _result(content: str, combined: float = 0.5, rerank: float | None = None) -> RetrievalResult:
    return RetrievalResult(
        id=1, content=content, source_type="grade", source_id="cs3114",
        metadata={"subject": "CS", "course_number": "3114"},
        combined_score=combined, rerank_score=rerank,
    )


# ── Planner.plan() ────────────────────────────────────────────────────────────

class TestPlannerPlan:
    def setup_method(self):
        self.p = QueryPlannerAgent()

    def test_grade_source_for_difficulty_question(self):
        assert self.p.plan("which professor is hardest for CS 3114").source_filter == "grade"

    def test_requirement_source(self):
        assert self.p.plan("what courses do I need to graduate in CS").source_filter == "requirement"

    def test_course_code_extracted(self):
        assert self.p.plan("CS 3114 grade distribution").mentioned_course == "CS 3114"

    def test_semantic_boost_for_vague(self):
        assert self.p.plan("which professor is brutal to take").alpha >= 0.7

    def test_primary_query_is_original(self):
        q = "who is the best algorithms professor?"
        assert self.p.plan(q).primary_query == q


# ── Planner.replan() ─────────────────────────────────────────────────────────

class TestPlannerReplan:
    def setup_method(self):
        self.p = QueryPlannerAgent()
        self.prev = self.p.plan("which prof is hardest for CS 3114")

    def test_drops_source_filter(self):
        new = self.p.replan("which prof is hardest for CS 3114", self.prev, 1)
        assert new.source_filter is None

    def test_alpha_reduced(self):
        new = self.p.replan("which prof is hardest for CS 3114", self.prev, 1)
        assert new.alpha < self.prev.alpha

    def test_variant_references_course(self):
        new = self.p.replan("which prof is hardest for CS 3114", self.prev, 1)
        assert "3114" in new.primary_query or "CS" in new.primary_query

    def test_attempt2_keyword_dominant(self):
        r1 = self.p.replan("which prof is hardest for CS 3114", self.prev, 1)
        r2 = self.p.replan("which prof is hardest for CS 3114", r1, 2)
        assert r2.alpha == 0.2

    def test_query_variants_list(self):
        new = self.p.replan("which prof is hardest for CS 3114", self.prev, 1)
        assert isinstance(new.query_variants, list)


# ── Critic ────────────────────────────────────────────────────────────────────

class TestCritic:
    def setup_method(self):
        self.c = RetrievalCriticAgent()
        self.plan = QueryPlan(primary_query="CS 3114", mentioned_course="CS 3114")

    def test_accept_good_quality(self):
        results = [_result("CS 3114 Hamouda GPA 3.1 A% 45", combined=0.8, rerank=0.9)]
        assert self.c.evaluate("q", results, self.plan, 0, 2).decision == "ACCEPT"

    def test_retry_low_quality_early(self):
        results = [_result("unrelated content", combined=0.05)]
        assert self.c.evaluate("q", results, self.plan, 0, 2).decision == "RETRY"

    def test_fail_no_results_last_attempt(self):
        assert self.c.evaluate("q", [], self.plan, 2, 2).decision == "FAIL"

    def test_retry_no_results_early(self):
        assert self.c.evaluate("q", [], self.plan, 0, 2).decision == "RETRY"

    def test_entity_penalty_reduces_score(self):
        results = [_result("ECE 2004 circuits grade data", combined=0.8)]
        c_no_entity = self.c.evaluate("q", results, QueryPlan(primary_query="q"), 0, 2)
        c_with_entity = self.c.evaluate("q", results, self.plan, 0, 2)
        assert c_with_entity.quality_score <= c_no_entity.quality_score

    def test_no_retry_on_last_attempt(self):
        results = [_result("CS 3114 some data", combined=0.15)]
        d = self.c.evaluate("q", results, self.plan, 2, 2).decision
        assert d in ("ACCEPT", "FAIL")


# ── Critic LLM-judgement fallback ─────────────────────────────────────────────

class _FakeLLM:
    """Stub GemmaAnswerClient — only judge_relevance() is used by the critic."""

    def __init__(self, verdict: bool | None):
        self._verdict = verdict
        self.calls = 0

    def judge_relevance(self, question: str, context: str) -> bool | None:
        self.calls += 1
        return self._verdict


class TestCriticLLMJudge:
    def setup_method(self):
        self.plan = QueryPlan(primary_query="CS 3114", mentioned_course="CS 3114")
        # combined=0.15 lands in the borderline band (above _THRESHOLD_WEAK=0.08,
        # below _THRESHOLD_GOOD=0.35) on the last attempt for these fixtures.
        self.borderline_results = [_result("CS 3114 some data", combined=0.15)]

    def test_judge_yes_accepts(self):
        c = RetrievalCriticAgent(llm_client=_FakeLLM(verdict=True))
        result = c.evaluate("q", self.borderline_results, self.plan, 2, 2)
        assert result.decision == "ACCEPT"
        assert "llm-judged" in result.reason

    def test_judge_no_fails(self):
        c = RetrievalCriticAgent(llm_client=_FakeLLM(verdict=False))
        result = c.evaluate("q", self.borderline_results, self.plan, 2, 2)
        assert result.decision == "FAIL"
        assert "llm-judged" in result.reason

    def test_judge_undetermined_falls_back_to_heuristic_accept(self):
        c = RetrievalCriticAgent(llm_client=_FakeLLM(verdict=None))
        result = c.evaluate("q", self.borderline_results, self.plan, 2, 2)
        assert result.decision == "ACCEPT"
        assert "best available" in result.reason

    def test_no_llm_client_skips_judge_entirely(self):
        c = RetrievalCriticAgent()  # llm_client=None, same as before this feature
        result = c.evaluate("q", self.borderline_results, self.plan, 2, 2)
        assert result.decision == "ACCEPT"

    def test_judge_not_called_on_clear_accept(self):
        """Clear-quality results should never pay for the extra LLM call."""
        llm = _FakeLLM(verdict=True)
        c = RetrievalCriticAgent(llm_client=llm)
        good_results = [_result("CS 3114 Hamouda GPA 3.1 A% 45", combined=0.8, rerank=0.9)]
        c.evaluate("q", good_results, self.plan, 0, 2)
        assert llm.calls == 0

    def test_judge_not_called_on_no_results(self):
        """No candidates at all should never pay for the extra LLM call either."""
        llm = _FakeLLM(verdict=True)
        c = RetrievalCriticAgent(llm_client=llm)
        c.evaluate("q", [], self.plan, 2, 2)
        assert llm.calls == 0

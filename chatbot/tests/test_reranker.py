from __future__ import annotations

import math
from types import SimpleNamespace

import pytest

from app.rag.reranker import Reranker, canonical_candidate_text
from app.rag.retriever import RetrievalResult


def _settings(**overrides):
    values = {
        "rag_rerank_top_k": 5,
        "rag_top_k_rerank": 5,
        "cohere_api_key": "",
        "rag_enable_local_reranker": False,
        "rag_local_reranker_model": "fake-cross-encoder",
        "rag_local_reranker_device": "cpu",
        "rag_rerank_batch_size": 8,
        "rag_rerank_timeout_ms": 0,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _candidate(idx: int, source_id: str, combined: float, metadata: dict | None = None, content: str = ""):
    return RetrievalResult(
        id=idx,
        content=content or f"candidate {source_id}",
        source_type=(metadata or {}).get("source_type", "course"),
        source_id=source_id,
        metadata=metadata or {},
        vector_score=combined,
        keyword_score=0.0,
        combined_score=combined,
    )


def test_feature_flag_disabled_uses_passthrough_without_loading(monkeypatch):
    reranker = Reranker(settings=_settings(rag_enable_local_reranker=False))

    def fail_load():
        raise AssertionError("local model should not load")

    monkeypatch.setattr(reranker, "_load_cross_encoder", fail_load)
    candidates = [
        _candidate(1, "COURSE:CS 1114", 0.2),
        _candidate(2, "COURSE:CS 2114", 0.7),
    ]

    selected = reranker.rerank("CS 2114", candidates, top_k=2)

    assert [c.source_id for c in selected] == ["COURSE:CS 2114", "COURSE:CS 1114"]
    assert reranker.last_ranking_trace["method"] == "rrf_passthrough"
    assert reranker.last_ranking_trace["enabled"] is False
    assert [c.rerank_score for c in candidates] == [None, None]


class _FakeCrossEncoder:
    def __init__(self, scores):
        self.scores = scores

    def predict(self, pairs, **kwargs):
        assert len(pairs) == len(self.scores)
        assert kwargs.get("batch_size") == 8
        return self.scores


def test_feature_flag_enabled_scores_and_preserves_candidate_pool(monkeypatch):
    reranker = Reranker(settings=_settings(rag_enable_local_reranker=True))
    monkeypatch.setattr(reranker, "_load_cross_encoder", lambda: _FakeCrossEncoder([0.1, 0.9, 0.2]))
    candidates = [
        _candidate(1, "COURSE:BIT 3414", 0.9),
        _candidate(2, "COURSE:CS 4824", 0.4),
        _candidate(3, "COURSE:BCHM 4115", 0.3),
    ]

    selected = reranker.rerank("machine learning courses", candidates, top_k=2)

    assert [c.source_id for c in selected] == ["COURSE:CS 4824", "COURSE:BCHM 4115"]
    assert {c.source_id for c in selected}.issubset({c.source_id for c in candidates})
    assert selected[0].metadata == candidates[1].metadata
    assert candidates[1].rerank_score is None
    trace = reranker.last_ranking_trace
    assert trace["method"] == "local_cross_encoder"
    assert trace["enabled"] is True
    assert trace["fallback_used"] is False
    assert trace["cross_encoder_scores"]["COURSE:CS 4824"] == 0.9


def test_empty_candidates_records_empty_trace():
    reranker = Reranker(settings=_settings(rag_enable_local_reranker=True))
    assert reranker.rerank("anything", [], top_k=5) == []
    assert reranker.last_ranking_trace["input_ids"] == []
    assert reranker.last_ranking_trace["selected_ids"] == []


def test_single_candidate_returns_same_candidate_copy(monkeypatch):
    reranker = Reranker(settings=_settings(rag_enable_local_reranker=True))
    monkeypatch.setattr(reranker, "_load_cross_encoder", lambda: _FakeCrossEncoder([0.4]))
    candidate = _candidate(1, "COURSE:CS 2114", 0.3, {"subject": "CS", "course_number": "2114"})

    selected = reranker.rerank("CS 2114", [candidate], top_k=5)

    assert len(selected) == 1
    assert selected[0].source_id == "COURSE:CS 2114"
    assert selected[0] is not candidate
    assert candidate.rerank_score is None


@pytest.mark.parametrize("scores", [[math.nan, 0.2], [math.inf, 0.2]])
def test_fallback_on_non_finite_scores_preserves_rrf_order(monkeypatch, scores):
    reranker = Reranker(settings=_settings(rag_enable_local_reranker=True))
    monkeypatch.setattr(reranker, "_load_cross_encoder", lambda: _FakeCrossEncoder(scores))
    candidates = [
        _candidate(1, "COURSE:CS 1114", 0.8),
        _candidate(2, "COURSE:CS 2114", 0.5),
    ]

    selected = reranker.rerank("CS 2114", candidates, top_k=2)

    assert [c.source_id for c in selected] == ["COURSE:CS 1114", "COURSE:CS 2114"]
    assert reranker.last_ranking_trace["fallback_used"] is True
    assert "non-finite" in reranker.last_ranking_trace["fallback_reason"]


def test_stable_tie_ordering_uses_original_rrf_order(monkeypatch):
    reranker = Reranker(settings=_settings(rag_enable_local_reranker=True))
    monkeypatch.setattr(reranker, "_load_cross_encoder", lambda: _FakeCrossEncoder([0.5, 0.5, 0.5]))
    candidates = [
        _candidate(1, "A", 0.3),
        _candidate(2, "B", 0.2),
        _candidate(3, "C", 0.1),
    ]

    first = reranker.rerank("same", candidates, top_k=3)
    second = reranker.rerank("same", candidates, top_k=3)

    assert [c.source_id for c in first] == ["A", "B", "C"]
    assert [c.source_id for c in second] == ["A", "B", "C"]


def test_exact_course_pool_cannot_introduce_other_courses(monkeypatch):
    reranker = Reranker(settings=_settings(rag_enable_local_reranker=True))
    monkeypatch.setattr(reranker, "_load_cross_encoder", lambda: _FakeCrossEncoder([0.1, 0.9]))
    scoped = [
        _candidate(1, "GRADE:CS 2114:HAMOUDA", 0.5, {"subject": "CS", "course_number": "2114"}),
        _candidate(2, "GRADE:CS 2114:ESAKIA", 0.4, {"subject": "CS", "course_number": "2114"}),
    ]

    selected = reranker.rerank("Who should I take for CS 2114?", scoped, top_k=5)

    assert selected
    assert all(c.metadata["subject"] == "CS" and c.metadata["course_number"] == "2114" for c in selected)
    assert set(c.source_id for c in selected) == set(c.source_id for c in scoped)


def test_prohibited_or_rejected_candidates_are_not_reintroduced(monkeypatch):
    reranker = Reranker(settings=_settings(rag_enable_local_reranker=True))
    monkeypatch.setattr(reranker, "_load_cross_encoder", lambda: _FakeCrossEncoder([0.6]))
    approved_only = [_candidate(1, "COURSE:CS 2114", 0.5)]

    selected = reranker.rerank("CS 2114", approved_only, top_k=5)

    assert [c.source_id for c in selected] == ["COURSE:CS 2114"]
    assert "COURSE:CS 1114" not in reranker.last_ranking_trace["input_ids"]


def test_canonical_text_omits_nulls_and_excludes_grade_context_for_topical_query():
    candidate = _candidate(
        1,
        "COURSE:CS 4824",
        0.5,
        {
            "source_type": "course",
            "subject": "CS",
            "course_number": "4824",
            "title": "Machine Learning",
            "description": "Predictive modeling and classification.",
            "avg_gpa": "3.9",
            "sample_size": None,
            "prerequisites": None,
        },
    )

    text = canonical_candidate_text(candidate, "Recommend AI and machine learning courses")

    assert "None" not in text
    assert "null" not in text.lower()
    assert "Course: CS 4824" in text
    assert "Machine Learning" in text
    assert "Average GPA" not in text


def test_canonical_text_includes_grade_context_when_query_asks_for_outcomes():
    candidate = _candidate(
        1,
        "GRADE:CS 2114:HAMOUDA",
        0.5,
        {
            "source_type": "grade",
            "subject": "CS",
            "course_number": "2114",
            "instructor": "Mohammed Hamouda",
            "avg_gpa": "3.4",
            "sample_size": "250",
        },
    )

    text = canonical_candidate_text(candidate, "Which professor has the strongest grade outcomes?")

    assert "Professor: Mohammed Hamouda" in text
    assert "Average GPA: 3.4" in text
    assert "Student sample size: 250" in text

"""
Unit tests for IntentExtractor — LLM path (mocked), fallback path, timeout.
Runs without any live services.
"""

import time
from unittest.mock import MagicMock

import pytest

from app.rag.intent_extractor import IntentExtractor, ChatIntent


def _make_extractor(llm_response: str | None = None, timeout_s: float = 5.0):
    llm = MagicMock()
    llm.answer_raw.return_value = llm_response

    class _FakeSettings:
        rag_intent_timeout_s = timeout_s

    return IntentExtractor(llm, settings=_FakeSettings())


# ── LLM path ──────────────────────────────────────────────────────────────────

def test_llm_path_course_profile():
    response = '{"route":"course_profile","confidence":0.9,"subject":"CS","course_no":"3114","sort_goal":"lowest_gpa"}'
    intent = _make_extractor(response).extract("which prof is hardest for cs 3114")
    assert intent.route == "course_profile"
    assert intent.subject == "CS"
    assert intent.course_no == "3114"
    assert intent.sort_goal == "lowest_gpa"


def test_llm_path_professor_profile():
    response = '{"route":"professor_profile","confidence":0.85,"professor_name":"Hamouda"}'
    intent = _make_extractor(response).extract("is Hamouda good?")
    assert intent.route == "professor_profile"
    assert intent.professor_name == "Hamouda"


def test_llm_path_strips_markdown_fence():
    response = '```json\n{"route":"natural_filter","confidence":0.8,"sort_goal":"highest_gpa"}\n```'
    intent = _make_extractor(response).extract("which courses have the highest GPA?")
    assert intent.route == "natural_filter"
    assert intent.sort_goal == "highest_gpa"


def test_garbage_response_falls_back():
    intent = _make_extractor("this is not json at all").extract("CS 3114")
    assert isinstance(intent, ChatIntent)


def test_low_confidence_falls_back():
    response = '{"route":"course_profile","confidence":0.3,"subject":"CS","course_no":"3114"}'
    intent = _make_extractor(response).extract("CS 3114")
    assert isinstance(intent, ChatIntent)


def test_none_response_falls_back():
    intent = _make_extractor(None).extract("who teaches algorithms?")
    assert isinstance(intent, ChatIntent)


def test_invalid_route_defaults_to_general_rag():
    response = '{"route":"totally_unknown","confidence":0.9}'
    intent = _make_extractor(response).extract("test")
    assert intent.route == "general_rag"


# ── Timeout ───────────────────────────────────────────────────────────────────

def test_timeout_does_not_block():
    llm = MagicMock()

    def _slow(*args, **kwargs):
        time.sleep(2.0)
        return '{"route":"course_profile","confidence":0.9}'

    llm.answer_raw.side_effect = _slow

    class _FastTimeout:
        rag_intent_timeout_s = 0.1

    ext = IntentExtractor(llm, settings=_FastTimeout())
    start = time.monotonic()
    intent = ext.extract("cs 3114 hardest professor")
    elapsed = time.monotonic() - start

    assert elapsed < 1.5, f"Timeout did not bound latency: {elapsed:.2f}s"
    assert isinstance(intent, ChatIntent)


# ── Keyword fallback ──────────────────────────────────────────────────────────

def test_keyword_fallback_confidence():
    ext = _make_extractor(None)
    ext._enabled = False
    intent = ext.extract("CS 3114 best professor grades")
    assert intent.confidence == 0.7

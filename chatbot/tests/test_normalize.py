"""
Unit tests for normalize_question and EntityResolver.
Runs without any live services — no Supabase, no LLM.
"""

import pandas as pd
import pytest

from app.safety.guardrails import normalize_question
from app.safety.entity_resolver import EntityResolver


# ── normalize_question ────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw, expected_fragment", [
    ("wwich prof is hardist for cs 3114", "which"),
    ("wwich prof is hardist for cs 3114", "hardest"),
    ("is hamoda good for algorithims", "algorithms"),
    ("whihc cse coarses are easist", "which"),
    ("whihc cse coarses are easist", "cs"),
    ("whihc cse coarses are easist", "courses"),
    ("whihc cse coarses are easist", "easiest"),
    ("what reqirements do i need for comp sci", "requirements"),
    ("what reqirements do i need for comp sci", "cs"),
    ("mth 2114 grade distribution", "math"),
])
def test_normalize_contains(raw, expected_fragment):
    result = normalize_question(raw)
    assert expected_fragment in result.lower(), (
        f"normalize_question({raw!r}) -> {result!r}, expected fragment {expected_fragment!r}"
    )


def test_normalize_preserves_course_code():
    result = normalize_question("CS 3114 grade distribution")
    assert "3114" in result


def test_normalize_empty():
    assert normalize_question("") == ""


def test_normalize_no_false_positives():
    # "is" must not become "ISE" (a VT subject code)
    result = normalize_question("who is the best professor")
    assert " is " in result.lower()


# ── EntityResolver ────────────────────────────────────────────────────────────

@pytest.fixture
def resolver():
    grades = pd.DataFrame({
        "Instructor": ["Mohamed Hamouda", "John Sible", "Cliff Shaffer", "Staff"],
        "Subject":    ["CS", "CS", "CS", "CS"],
        "Course No.": ["3114", "3114", "3114", "1114"],
    })
    courses = pd.DataFrame({
        "subject": ["CS", "CS"],
        "course_number": ["3114", "2114"],
    })
    return EntityResolver(grades, courses)


def test_resolve_professor_exact(resolver):
    assert resolver.resolve_professor("Mohamed Hamouda") == "Mohamed Hamouda"


def test_resolve_professor_fuzzy_last_name(resolver):
    result = resolver.resolve_professor("Hamuda")
    assert result == "Mohamed Hamouda"


def test_resolve_professor_no_match_returns_original(resolver):
    result = resolver.resolve_professor("Completely Unknown Person")
    assert result == "Completely Unknown Person"


def test_resolve_course_code_valid(resolver):
    subj, num = resolver.resolve_course_code("CS", "3114")
    assert subj == "CS" and num == "3114"


def test_resolve_course_code_normalises_case(resolver):
    subj, num = resolver.resolve_course_code("cs", "3114")
    assert subj == "CS"


def test_resolve_course_code_unknown_passthrough(resolver):
    subj, num = resolver.resolve_course_code("CS", "9999")
    assert subj == "CS" and num == "9999"


def test_resolve_question_entities_finds_professor(resolver):
    prof, _ = resolver.resolve_question_entities("is hamouda good for algorithms")
    assert prof == "Mohamed Hamouda"


def test_resolve_empty_dataframes():
    er = EntityResolver(None, None)
    assert er.resolve_professor("Anyone") == "Anyone"
    s, n = er.resolve_course_code("CS", "3114")
    assert s == "CS" and n == "3114"

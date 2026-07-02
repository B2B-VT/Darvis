"""
tests/test_rag_refactor.py

Tests for the agentic RAG refactor: QueryPlan validation, deterministic
planner fallback, entity resolution, precomputed indexes, sufficiency
checking / hallucination guards, and schedule-builder constraint parsing.

All tests are LLM-free — they exercise the deterministic layers only.
"""

import pandas as pd
import pytest

from app.rag.planner_models import QueryPlan, coerce_time
from app.rag.query_planner import QueryPlanner, _repair_json
from app.safety.entity_resolver import EntityResolver
from app.data.indexes import DataIndexes
from app.rag.verifier import check_plan, missing_data_answer
from app.features.schedule_builder import (
    parse_time_constraints, parse_excluded_days, parse_min_gpa,
    parse_min_rmp, parse_requested_courses, _conflicts,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def grades_df():
    return pd.DataFrame([
        {"Subject": "CS", "Course No.": "1114", "Course Title": "Intro to Software Design",
         "Instructor": "Mohammed Hamouda", "GPA": 3.0, "A (%)": 30.0, "A- (%)": 10.0,
         "F (%)": 5.0, "Withdraws": 2, "Graded Enrollment": 100,
         "Academic Year": "2023-24", "Term": "Fall"},
        {"Subject": "CS", "Course No.": "1114", "Course Title": "Intro to Software Design",
         "Instructor": "Mohammed Hamouda", "GPA": 4.0, "A (%)": 60.0, "A- (%)": 20.0,
         "F (%)": 1.0, "Withdraws": 1, "Graded Enrollment": 50,
         "Academic Year": "2024-25", "Term": "Fall"},
        {"Subject": "CS", "Course No.": "1114", "Course Title": "Intro to Software Design",
         "Instructor": "John Lewis", "GPA": 2.5, "A (%)": 15.0, "A- (%)": 5.0,
         "F (%)": 12.0, "Withdraws": 8, "Graded Enrollment": 200,
         "Academic Year": "2023-24", "Term": "Fall"},
        {"Subject": "MATH", "Course No.": "1225", "Course Title": "Calculus of a Single Variable",
         "Instructor": "Mary Lewis", "GPA": 3.2, "A (%)": 35.0, "A- (%)": 10.0,
         "F (%)": 6.0, "Withdraws": 3, "Graded Enrollment": 150,
         "Academic Year": "2023-24", "Term": "Fall"},
    ])


@pytest.fixture
def courses_df():
    return pd.DataFrame([
        {"subject": "CS", "course_number": "1114", "title": "Intro to Software Design",
         "credits": 3, "avg_gpa": 3.1, "description": None, "pathways": None},
        {"subject": "MATH", "course_number": "1225", "title": "Calculus of a Single Variable",
         "credits": 4, "avg_gpa": 3.0, "description": None, "pathways": None},
    ])


@pytest.fixture
def sections_df():
    return pd.DataFrame([
        {"crn": "12345", "term": "202609", "subject": "CS", "course_number": "1114",
         "instructor": "Mohammed Hamouda", "days": ["M", "W"], "start_time": "13:30",
         "end_time": "14:45", "location": "MCB 100", "seats": 30, "enrolled": 10, "credits": 3.0},
        {"crn": "23456", "term": "202609", "subject": "MATH", "course_number": "1225",
         "instructor": "Mary Lewis", "days": ["T", "R"], "start_time": "09:05",
         "end_time": "09:55", "location": "SURGE 104", "seats": 40, "enrolled": 40, "credits": 4.0},
    ])


@pytest.fixture
def instructors_df():
    return pd.DataFrame([
        {"name": "Mohammed Hamouda", "rmp_rating": 4.5, "rmp_difficulty": 2.5, "rmp_count": 80},
        {"name": "John Lewis", "rmp_rating": 3.1, "rmp_difficulty": 4.0, "rmp_count": 40},
        {"name": "Mary Lewis", "rmp_rating": None, "rmp_difficulty": None, "rmp_count": 0},
    ])


@pytest.fixture
def resolver(grades_df, courses_df, instructors_df, sections_df):
    return EntityResolver(grades_df, courses_df, instructors_df=instructors_df, sections_df=sections_df)


@pytest.fixture
def indexes(grades_df, courses_df, sections_df, instructors_df):
    return DataIndexes(grades_df, courses_df, sections_df, instructors_df)


@pytest.fixture
def planner():
    return QueryPlanner(None)  # no LLM → always deterministic fallback


# ── coerce_time ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("13:00", "13:00"),
    ("13:00:00", "13:00"),
    ("1pm", "13:00"),
    ("1 pm", "13:00"),
    ("1:00 PM", "13:00"),
    ("8am", "08:00"),
    ("12am", "00:00"),
    ("12pm", "12:00"),
    ("noon", "12:00"),
    ("9:05", "09:05"),
    ("garbage", None),
    (None, None),
    ("25:00", None),
])
def test_coerce_time(raw, expected):
    assert coerce_time(raw) == expected


# ── QueryPlan validation ──────────────────────────────────────────────────────

def test_plan_invalid_route_degrades():
    plan = QueryPlan.model_validate({"route": "nonsense_route"})
    assert plan.route == "general_rag"


def test_plan_invalid_sort_goal_degrades():
    plan = QueryPlan.model_validate({"sort_goal": "most_vibes"})
    assert plan.sort_goal == "highest_gpa"


def test_plan_confidence_clamped():
    assert QueryPlan.model_validate({"confidence": 7}).confidence == 1.0
    assert QueryPlan.model_validate({"confidence": -1}).confidence == 0.0
    assert QueryPlan.model_validate({"confidence": "high"}).confidence == 0.8


def test_plan_requested_courses_coercion():
    plan = QueryPlan.model_validate({
        "requested_courses": [["cs", "1114"], {"subject": "MATH", "no": "1225"}, "ECE2514", "junk"]
    })
    assert ("CS", "1114") in plan.requested_courses
    assert ("MATH", "1225") in plan.requested_courses
    assert ("ECE", "2514") in plan.requested_courses
    assert len(plan.requested_courses) == 3


def test_plan_excluded_days_coercion():
    plan = QueryPlan.model_validate({"excluded_days": ["friday", "M", "bogus"]})
    assert plan.excluded_days == ["F", "M"]


def test_plan_times_coerced():
    plan = QueryPlan.model_validate({"time_start": "1pm", "time_end": "17:00:00"})
    assert plan.time_start == "13:00"
    assert plan.time_end == "17:00"


def test_plan_missing_data_field_validated():
    assert QueryPlan.model_validate({"missing_data_field": "prerequisites"}).missing_data_field == "prerequisites"
    assert QueryPlan.model_validate({"missing_data_field": "professor_salary"}).missing_data_field is None


# ── JSON repair ───────────────────────────────────────────────────────────────

def test_repair_json_fixes_common_llm_mistakes():
    import json
    broken = '{"route": "course_profile", "wants_rmp": True, "min_gpa": None, "capabilities": ["course_lookup",]}'
    assert json.loads(_repair_json(broken))["route"] == "course_profile"


# ── Deterministic planner fallback ────────────────────────────────────────────

def test_fallback_schedule_route(planner):
    plan = planner.plan("build me a schedule with cs 1114 and math 1225 with no friday classes")
    assert plan.route == "schedule_builder"
    assert ("CS", "1114") in plan.requested_courses
    assert ("MATH", "1225") in plan.requested_courses
    assert "F" in plan.excluded_days


def test_fallback_prereq_flags_missing_data(planner):
    plan = planner.plan("what are the prereqs for CS 3114?")
    assert plan.missing_data_field == "prerequisites"


def test_planner_cache_returns_copies(planner):
    p1 = planner.plan("build me a schedule")
    p1.subject = "MUTATED"
    p2 = planner.plan("build me a schedule")
    assert p2.subject != "MUTATED"


# ── Entity resolution ─────────────────────────────────────────────────────────

def test_resolve_professor_exact(resolver):
    res = resolver.resolve_professor_ex("Mohammed Hamouda")
    assert res.value == "Mohammed Hamouda"
    assert res.confidence == 1.0


def test_resolve_professor_last_name(resolver):
    res = resolver.resolve_professor_ex("Hamouda")
    assert res.value == "Mohammed Hamouda"
    assert res.confidence >= 0.9


def test_resolve_professor_typo(resolver):
    res = resolver.resolve_professor_ex("Hamuda")
    assert res.value == "Mohammed Hamouda"
    assert res.confidence >= 0.75


def test_resolve_professor_ambiguous_last_name(resolver):
    res = resolver.resolve_professor_ex("Lewis")
    assert res.ambiguous is True
    assert set(res.candidates) == {"John Lewis", "Mary Lewis"}
    assert res.warning


def test_resolve_professor_full_name_disambiguates(resolver):
    res = resolver.resolve_professor_ex("Mary Lewis")
    assert res.value == "Mary Lewis"
    assert res.confidence >= 0.9


def test_resolve_professor_unknown(resolver):
    res = resolver.resolve_professor_ex("Zzyzzyx")
    assert res.confidence == 0.0
    assert res.warning


@pytest.mark.parametrize("ref", ["CS 1114", "cs1114", "CS-1114", "cs 1114", "computer science 1114"])
def test_resolve_course_formats(resolver, ref):
    res = resolver.resolve_course_ref(ref)
    assert res.value == "CS 1114"
    assert res.confidence >= 0.9


def test_resolve_course_by_title(resolver):
    res = resolver.resolve_course_ref("intro to software design")
    assert res.value == "CS 1114"


def test_resolve_course_unknown_number(resolver):
    res = resolver.resolve_course_ref("CS 9999")
    assert res.confidence <= 0.5
    assert res.warning


# ── Precomputed indexes ───────────────────────────────────────────────────────

def test_enrollment_weighted_gpa(indexes):
    # Hamouda: (3.0*100 + 4.0*50) / 150 = 3.333
    agg = indexes.instructor_by_last["hamouda"]
    assert agg.weighted_gpa == pytest.approx(3.333, abs=0.001)
    assert agg.total_students == 150
    assert agg.terms_taught == 2


def test_course_instructor_stats_sorted(indexes):
    stats = indexes.instructor_course_stats("CS", "1114")
    assert [s.name for s in stats] == ["Mohammed Hamouda", "John Lewis"]
    assert stats[0].weighted_gpa > stats[1].weighted_gpa


def test_course_stats(indexes):
    course = indexes.course("CS", "1114")
    # (3.0*100 + 4.0*50 + 2.5*200) / 350 = 2.857
    assert course.weighted_gpa == pytest.approx(2.857, abs=0.001)
    assert course.instructors_count == 2


def test_withdraw_rate(indexes):
    agg = indexes.instructor_by_last["hamouda"]
    assert agg.withdraw_rate == pytest.approx(2.0, abs=0.01)  # 3 of 150


def test_sections_by_course(indexes):
    secs = indexes.sections_for("CS", "1114")
    assert len(secs) == 1
    assert secs[0]["crn"] == "12345"


def test_rmp_index_skips_null(indexes):
    assert indexes.rmp("Hamouda")["rating"] == 4.5
    # Mary Lewis has no rating; "lewis" maps to John Lewis (first with a rating)
    lewis = indexes.rmp("Mary Lewis")
    assert lewis is None or lewis["name"] == "John Lewis"


def test_empty_course_fields_detected(indexes):
    assert "description" in indexes.empty_course_fields
    assert "pathways" in indexes.empty_course_fields


def test_instructor_gpa_lookup(indexes):
    assert indexes.instructor_gpa("Mohammed Hamouda") == pytest.approx(3.333, abs=0.001)
    assert indexes.instructor_gpa("Unknown Person") is None


# ── Sufficiency / hallucination guards ────────────────────────────────────────

def test_missing_prereqs_honest_answer(indexes):
    plan = QueryPlan(route="course_profile", subject="CS", course_no="3114",
                     missing_data_field="prerequisites")
    ans = missing_data_answer(plan, indexes)
    assert ans is not None
    assert "doesn't currently have prerequisite data" in ans
    assert "CS 3114" in ans


def test_missing_description_honest_answer(indexes):
    plan = QueryPlan(subject="CS", course_no="1114", missing_data_field="description")
    ans = missing_data_answer(plan, indexes)
    assert "descriptions" in ans


def test_nonexistent_course_honest_answer(indexes):
    plan = QueryPlan(route="course_profile", subject="CS", course_no="9999")
    gate = check_plan(plan, indexes=indexes)
    assert gate.sufficient is False
    assert "couldn't find CS 9999" in gate.answer_override


def test_valid_course_passes_gate(indexes):
    plan = QueryPlan(route="course_profile", subject="CS", course_no="1114")
    gate = check_plan(plan, indexes=indexes)
    assert gate.sufficient is True


def test_clarification_only_without_entities(indexes):
    plan = QueryPlan(needs_clarification=True, clarifying_question="Which course do you mean?")
    gate = check_plan(plan, indexes=indexes)
    assert gate.sufficient is False
    assert gate.clarification == "Which course do you mean?"

    # With an entity present, don't over-ask — answer with assumptions instead
    plan2 = QueryPlan(needs_clarification=True, clarifying_question="Which?",
                      subject="CS", course_no="1114")
    gate2 = check_plan(plan2, indexes=indexes)
    assert gate2.sufficient is True


# ── Schedule builder constraint parsing ───────────────────────────────────────

def test_after_1pm():
    start, _ = parse_time_constraints("all classes after the times of 1pm")
    assert start == "13:00"


def test_no_8ams():
    start, _ = parse_time_constraints("make a schedule but avoid 8ams")
    assert start >= "09:00"


def test_morning_only():
    _, end = parse_time_constraints("morning classes only please")
    assert end <= "12:00"


def test_no_friday():
    assert "F" in parse_excluded_days("without a single class on friday")
    assert "F" in parse_excluded_days("no friday classes")


def test_min_gpa_phrasings():
    assert parse_min_gpa("without a single class having a gpa of lower than 3.5") == 3.5
    assert parse_min_gpa("gpa above 3.2") == 3.2
    assert parse_min_gpa("no gpa mentioned here") is None


def test_min_rmp_phrasings():
    assert parse_min_rmp("rate my professor scores of 3.5 or higher") == 3.5


def test_requested_courses_compact_format():
    parsed = parse_requested_courses("schedule with cs1114 and math1225")
    assert ("CS", "1114") in parsed
    assert ("MATH", "1225") in parsed


def test_conflict_detection():
    a = {"days": ["M", "W"], "start_time": "13:30", "end_time": "14:45"}
    b = {"days": ["M"], "start_time": "14:00", "end_time": "15:00"}
    c = {"days": ["T"], "start_time": "14:00", "end_time": "15:00"}
    d = {"days": ["M"], "start_time": "14:45", "end_time": "15:45"}
    assert _conflicts(a, b) is True     # overlapping M
    assert _conflicts(a, c) is False    # different days
    assert _conflicts(a, d) is False    # back-to-back is not a conflict

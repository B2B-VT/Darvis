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
from app.features.course_profile import handle_course_profile
from app.features.natural_filter import handle_natural_filter
from app.features.section_lookup import handle_section_lookup
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
    assert QueryPlan.model_validate({"missing_data_field": "workload"}).missing_data_field == "workload"
    assert QueryPlan.model_validate({"missing_data_field": "professor_salary"}).missing_data_field is None


# ── JSON repair ───────────────────────────────────────────────────────────────

def test_repair_json_fixes_common_llm_mistakes():
    import json
    broken = '{"route": "course_profile", "wants_rmp": True, "min_gpa": None, "capabilities": ["course_lookup",]}'
    assert json.loads(_repair_json(broken))["route"] == "course_profile"


# ── Multi-route (secondary_routes) planning ─────────────────────────────────────

class _FakeLLMMultiRoute:
    """Duck-types the LLM client's answer_raw() — returns a fixed plan JSON
    with a secondary route, as if the LLM detected a two-domain question."""

    def answer_raw(self, prompt, max_tokens=400):
        return (
            '{"route": "natural_filter", "secondary_routes": ["professor_profile"], '
            '"confidence": 0.9, "sort_goal": "highest_gpa"}'
        )


def test_plan_multi_route_secondary():
    planner = QueryPlanner(_FakeLLMMultiRoute())
    plan = planner.plan("which CS professors teach the easiest 3000-level courses?")
    assert plan.route == "natural_filter"
    assert plan.secondary_routes == ["professor_profile"]


# ── LLM-unavailable fallback ──────────────────────────────────────────────────
# Planner failures should not make the whole chat surface look down. Explicit
# prompts can still route deterministically; ambiguous prompts fall through to
# general_rag so the normal answer path can respond.

def test_fallback_asks_clarification_for_ambiguous_prompt(planner):
    plan = planner.plan("which professor should I take")
    assert plan.route == "general_rag"
    assert plan.needs_clarification is True
    assert plan.clarifying_question


def test_fallback_routes_greeting_without_llm(planner):
    plan = planner.plan("hi")
    assert plan.route == "general_rag"
    assert plan.needs_clarification is False


def test_fallback_marks_homework_as_missing_workload_data(planner):
    plan = planner.plan("Which professor gives the least homework?")
    assert plan.route == "general_rag"
    assert plan.missing_data_field == "workload"
    assert plan.professor_name is None


def test_fallback_routes_named_greeting_without_llm(planner):
    plan = planner.plan("hello cyrus")
    assert plan.route == "general_rag"
    assert plan.needs_clarification is False


def test_fallback_routes_explicit_schedule_without_llm(planner):
    plan = planner.plan("build me a schedule with cs 1114 and math 1225 with no 8ams")
    assert plan.route == "schedule_builder"
    assert plan.time_start == "09:00"
    assert ("CS", "1114") in plan.requested_courses
    assert ("MATH", "1225") in plan.requested_courses


def test_fallback_routes_explicit_course_without_llm(planner):
    plan = planner.plan("who is the best professor for CS 3114")
    assert plan.route == "course_profile"
    assert plan.subject == "CS"
    assert plan.course_no == "3114"


def test_fallback_routes_explicit_course_comparison_without_llm(planner):
    plan = planner.plan("Compare CS 1114 and CS 2114")
    assert plan.route == "course_profile"
    assert "course_comparison" in plan.capabilities
    assert ("CS", "1114") in plan.requested_courses
    assert ("CS", "2114") in plan.requested_courses


def test_fallback_routes_explicit_section_lookup_without_llm(planner):
    plan = planner.plan("who teaches CS 3114 this fall")
    assert plan.route == "section_lookup"
    assert plan.subject == "CS"
    assert plan.course_no == "3114"


def test_fallback_routes_natural_filter_without_llm(planner):
    plan = planner.plan("which CS 3000-level electives have the highest average GPA")
    assert plan.route == "natural_filter"
    assert plan.subject == "CS"
    assert plan.level_low == 3000
    assert plan.level_high == 3999


def test_fallback_routes_topic_course_recommendation_without_llm(planner):
    plan = planner.plan("What are some good data analytics courses?")
    assert plan.route == "natural_filter"
    assert plan.wants_professors is False
    assert plan.display_n == 3


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


def test_missing_workload_honest_answer(indexes):
    plan = QueryPlan(route="general_rag", missing_data_field="workload")
    ans = missing_data_answer(plan, indexes)
    assert "homework-load or workload data" in ans
    assert "historical grade outcomes" in ans


def test_main_detects_workload_question():
    from app.main import _asks_workload_question

    assert _asks_workload_question("Which professor gives the least homework?")
    assert _asks_workload_question("Who has the lightest workload for CS 2114?")
    assert not _asks_workload_question("Which professor has the highest A rate?")


def test_homework_is_not_fuzzy_resolved_to_homer():
    instructors = pd.DataFrame([{"name": "Matt Homer"}])
    resolver = EntityResolver(None, None, instructors_df=instructors)
    resolved = resolver.resolve_professor_ex("homework")
    assert resolved.value == "homework"
    assert resolved.confidence == 0.0
    prof, _ = resolver.resolve_question_entities("Which professor gives the least homework?")
    assert prof is None


def test_populated_prereqs_answer():
    # Once catalog.vt.edu data is scraped and imported, the same missing_data_field
    # plan should answer from the real value instead of claiming it's absent.
    courses_df = pd.DataFrame([
        {"subject": "CS", "course_number": "3114", "title": "Data Structures & Algorithms",
         "credits": 3, "avg_gpa": 2.9, "description": "Studies of data structures...",
         "pathways": None, "prerequisites": "CS 2114 and CS 2506, each with a grade of C- or better"},
    ])
    idx = DataIndexes(courses_df=courses_df)
    plan = QueryPlan(route="course_profile", subject="CS", course_no="3114",
                     missing_data_field="prerequisites")
    ans = missing_data_answer(plan, idx)
    assert ans == "Prerequisites for CS 3114: CS 2114 and CS 2506, each with a grade of C- or better"


def test_populated_description_answer():
    courses_df = pd.DataFrame([
        {"subject": "CS", "course_number": "3114", "title": "Data Structures & Algorithms",
         "credits": 3, "avg_gpa": 2.9, "description": "Studies of data structures...",
         "pathways": None, "prerequisites": None},
    ])
    idx = DataIndexes(courses_df=courses_df)
    plan = QueryPlan(subject="CS", course_no="3114", missing_data_field="description")
    ans = missing_data_answer(plan, idx)
    assert ans == "CS 3114 — Studies of data structures..."


def test_populated_field_no_value_for_course_stays_silent():
    # Field is populated DB-wide (some course has prereqs), but this specific
    # course has none scraped — must not guess "no prerequisites exist".
    courses_df = pd.DataFrame([
        {"subject": "CS", "course_number": "3114", "title": "Data Structures & Algorithms",
         "credits": 3, "avg_gpa": 2.9, "description": None, "pathways": None,
         "prerequisites": "CS 2114"},
        {"subject": "CS", "course_number": "1114", "title": "Intro to Software Design",
         "credits": 3, "avg_gpa": 3.1, "description": None, "pathways": None,
         "prerequisites": None},
    ])
    idx = DataIndexes(courses_df=courses_df)
    plan = QueryPlan(route="course_profile", subject="CS", course_no="1114",
                     missing_data_field="prerequisites")
    assert missing_data_answer(plan, idx) is None


def test_nonexistent_course_honest_answer(indexes):
    plan = QueryPlan(route="course_profile", subject="CS", course_no="9999")
    gate = check_plan(plan, indexes=indexes)
    assert gate.sufficient is False
    assert "couldn't find CS 9999" in gate.answer_override


def test_valid_course_passes_gate(indexes):
    plan = QueryPlan(route="course_profile", subject="CS", course_no="1114")
    gate = check_plan(plan, indexes=indexes)
    assert gate.sufficient is True


class _EmptyVectorStore:
    def query(self, question, n_results=6):
        return ""


class _RecordingLLM:
    def __init__(self):
        self.calls = 0

    def answer(self, prompt, history=None):
        self.calls += 1
        return "unsupported model answer"


def test_natural_filter_empty_result_does_not_call_llm(grades_df):
    plan = QueryPlan(route="natural_filter", subject="ECE", sort_goal="highest_gpa")
    llm = _RecordingLLM()

    answer, tables, charts, metadata = handle_natural_filter(
        "Which ECE electives have the highest GPA?",
        grades_df,
        llm,
        _EmptyVectorStore(),
        top_n=5,
        use_recency=True,
        intent=plan,
    )

    assert "doesn't have grade data" in answer
    assert tables == []
    assert charts == []
    assert metadata == {}
    assert llm.calls == 0


class _FailIfNaturalFilterLLMCalled:
    def answer(self, *args, **kwargs):
        raise AssertionError("topic course recommendations should not call the LLM")


def test_topic_course_recommendations_use_relevance_and_descriptions(grades_df):
    courses_df = pd.DataFrame([
        {
            "subject": "STAT",
            "course_number": "5525",
            "title": "Data Analytics",
            "credits": 3,
            "avg_gpa": 3.5,
            "description": "Introduces methods for extracting insight from data using analytics workflows.",
            "pathways": None,
            "prerequisites": None,
        },
        {
            "subject": "CS",
            "course_number": "4604",
            "title": "Introduction to Database Management Systems",
            "credits": 3,
            "avg_gpa": 3.1,
            "description": "Covers data modeling, querying, and systems that support analytics applications.",
            "pathways": None,
            "prerequisites": None,
        },
        {
            "subject": "BIT",
            "course_number": "3444",
            "title": "Advanced Business Computing and Applications",
            "credits": 3,
            "avg_gpa": 3.0,
            "description": "Uses business data tools for reporting, dashboards, and analytics decisions.",
            "pathways": None,
            "prerequisites": None,
        },
        {
            "subject": "MUS",
            "course_number": "1004",
            "title": "Easy Listening",
            "credits": 3,
            "avg_gpa": 4.0,
            "description": "A music appreciation course with no analytics content.",
            "pathways": None,
            "prerequisites": None,
        },
    ])
    idx = DataIndexes(grades_df=grades_df, courses_df=courses_df)

    answer, tables, charts, metadata = handle_natural_filter(
        "What are some good data analytics courses?",
        grades_df,
        _FailIfNaturalFilterLLMCalled(),
        vector_store=None,
        top_n=5,
        use_recency=False,
        indexes=idx,
    )

    assert answer.startswith("Here are good data analytics course matches")
    assert "STAT 5525" in answer
    assert "CS 4604" in answer
    assert "BIT 3444" in answer
    assert "MUS 1004" not in answer
    assert "topic matches first" in answer
    assert tables[0]["title"] == "Course Recommendations"
    assert charts == []
    assert metadata["recommendation_mode"] == "topic_courses"


class _FailIfCalledLLM:
    def generate(self, prompt):
        raise AssertionError("section lookup should not call the LLM")

    def answer(self, prompt, history=None):
        raise AssertionError("section lookup should not call the LLM")


def test_section_lookup_simple_answer_is_deterministic(grades_df, sections_df):
    plan = QueryPlan(route="section_lookup", subject="CS", course_no="1114")
    answer, tables, charts, metadata = handle_section_lookup(
        "who teaches CS 1114 this fall",
        grades_df,
        _FailIfCalledLLM(),
        intent=plan,
        sections_df=sections_df,
    )

    assert "CS 1114 is taught by Mohammed Hamouda" in answer
    assert tables
    assert charts == []
    assert metadata["section_count"] == 1


def test_section_lookup_combined_answer_is_deterministic(grades_df, sections_df, instructors_df):
    plan = QueryPlan(route="section_lookup", subject="CS", course_no="1114")
    answer, tables, charts, metadata = handle_section_lookup(
        "of the professors teaching CS 1114 this fall, who is best?",
        grades_df,
        _FailIfCalledLLM(),
        rmp_df=instructors_df,
        intent=plan,
        sections_df=sections_df,
    )

    assert "Mohammed Hamouda" in answer
    assert "GPA" in answer
    assert tables
    assert charts == []
    assert metadata["section_count"] == 1


class _HallucinatingCourseLLM:
    def answer(self, *args, **kwargs):
        return "Darvis doesn't have grade-outcome data for any professor teaching CS 1114."


def test_course_profile_uses_structured_rows_over_llm_hallucination(grades_df, sections_df, indexes):
    answer, tables, charts, metadata = handle_course_profile(
        "tell me about CS 1114",
        grades_df,
        _HallucinatingCourseLLM(),
        vector_store=None,
        min_students=1,
        top_n=5,
        use_recency=False,
        sections_df=sections_df,
        indexes=indexes,
    )

    assert "doesn't have grade-outcome data" not in answer
    assert "CS 1114" in answer
    assert "Mohammed Hamouda" in answer
    assert tables[0]["title"] == "Professor Summary"
    assert metadata == {"subject": "CS", "course_no": "1114"}


def test_course_overview_starts_with_description_then_professor_and_sections(grades_df, sections_df):
    courses_df = pd.DataFrame([
        {
            "subject": "CS",
            "course_number": "1114",
            "title": "Introduction to Software Design",
            "credits": 3,
            "avg_gpa": 3.1,
            "description": "Introduces software design using structured programming and problem solving.",
            "pathways": None,
            "prerequisites": None,
        },
    ])
    idx = DataIndexes(grades_df=grades_df, courses_df=courses_df, sections_df=sections_df)

    answer, tables, charts, metadata = handle_course_profile(
        "Tell me about CS 1114",
        grades_df,
        _HallucinatingCourseLLM(),
        vector_store=None,
        min_students=1,
        top_n=5,
        use_recency=False,
        sections_df=sections_df,
        indexes=idx,
    )

    assert answer.startswith("CS 1114: Introduces software design")
    assert "By historical grade outcomes, Mohammed Hamouda" in answer
    assert "Fall 2026 has 1 section" in answer
    assert "open seats" in answer
    assert "doesn't have grade-outcome data" not in answer
    assert tables[0]["title"] == "Professor Summary"
    assert tables[1]["title"] == "Fall 2026 Sections"
    assert metadata == {"subject": "CS", "course_no": "1114"}


def test_course_comparison_uses_both_courses_without_missing_data_hallucination(grades_df, sections_df):
    comparison_grades = pd.concat([
        grades_df,
        pd.DataFrame([
            {"Subject": "CS", "Course No.": "2114", "Course Title": "Software Design and Data Structures",
             "Instructor": "Andrey Esakia", "GPA": 3.24, "A (%)": 38.0, "A- (%)": 11.8,
             "F (%)": 3.1, "Withdraws": 3, "Graded Enrollment": 229,
             "Academic Year": "2024-25", "Term": "Fall"},
        ]),
    ], ignore_index=True)
    comparison_sections = pd.concat([
        sections_df,
        pd.DataFrame([
            {"crn": "34567", "term": "202609", "subject": "CS", "course_number": "2114",
             "instructor": "Andrey Esakia", "days": ["T", "R"], "start_time": "11:00",
             "end_time": "12:15", "location": "NCB 320", "seats": 40, "enrolled": 20,
             "open_seats": 20, "credits": 3.0},
        ]),
    ], ignore_index=True)
    courses_df = pd.DataFrame([
        {"subject": "CS", "course_number": "1114", "title": "Introduction to Software Design",
         "credits": 3, "avg_gpa": 3.1, "description": "Introductory programming and software design.", "pathways": None},
        {"subject": "CS", "course_number": "2114", "title": "Software Design and Data Structures",
         "credits": 3, "avg_gpa": 3.2, "description": "Data structures and software design techniques.", "pathways": None},
    ])
    idx = DataIndexes(grades_df=comparison_grades, courses_df=courses_df, sections_df=comparison_sections)

    answer, tables, charts, metadata = handle_course_profile(
        "Compare CS 1114 and CS 2114",
        comparison_grades,
        _HallucinatingCourseLLM(),
        vector_store=None,
        min_students=1,
        top_n=5,
        use_recency=False,
        sections_df=comparison_sections,
        indexes=idx,
    )

    assert "CS 1114" in answer
    assert "CS 2114" in answer
    assert "does not have enough grade-outcome data" not in answer
    assert "Mohammed Hamouda" in answer
    assert "Andrey Esakia" in answer
    assert tables[0]["title"] == "Course Comparison"
    assert len(tables[0]["rows"]) == 2
    assert {row["Course"] for row in tables[0]["rows"]} == {"CS 1114", "CS 2114"}
    assert charts == []
    assert metadata["comparison_courses"] == [("CS", "1114"), ("CS", "2114")]


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


def test_retrieval_debug_disabled_by_default():
    from fastapi.testclient import TestClient
    from app import main

    old_debug = main.settings.rag_debug_mode
    main.settings.rag_debug_mode = False
    try:
        response = TestClient(main.app).post(
            "/retrieval/debug",
            json={"question": "CS 3114 grade distribution"},
        )
    finally:
        main.settings.rag_debug_mode = old_debug

    assert response.status_code == 404

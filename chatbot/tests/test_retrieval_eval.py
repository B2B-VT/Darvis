"""
Retrieval evaluation harness using the in-memory keyword fallback.
Seeded with synthetic grade rows — no live Supabase needed.

Run:  python -m pytest tests/test_retrieval_eval.py -v -s
"""

import pandas as pd
import pytest

from app.rag.vector_store import GradeVectorStore


_GRADES = pd.DataFrame([
    {"Subject": "CS", "Course No.": "3114", "Course Title": "Data Structures & Algorithms",
     "Instructor": "Mohamed Hamouda", "GPA": 2.8, "A (%)": 32.0, "F (%)": 15.0, "Graded Enrollment": 45},
    {"Subject": "CS", "Course No.": "3114", "Course Title": "Data Structures & Algorithms",
     "Instructor": "Cliff Shaffer", "GPA": 3.1, "A (%)": 45.0, "F (%)": 8.0, "Graded Enrollment": 60},
    {"Subject": "CS", "Course No.": "2114", "Course Title": "Intro Data Structures",
     "Instructor": "John Sible", "GPA": 3.3, "A (%)": 55.0, "F (%)": 5.0, "Graded Enrollment": 80},
    {"Subject": "CS", "Course No.": "3704", "Course Title": "Software Engineering",
     "Instructor": "Steve Edwards", "GPA": 3.5, "A (%)": 60.0, "F (%)": 3.0, "Graded Enrollment": 70},
])

_COURSES = pd.DataFrame([
    {"subject": "CS", "course_number": "3114", "title": "Data Structures & Algorithms", "avg_gpa": None},
    {"subject": "CS", "course_number": "2114", "title": "Intro Data Structures", "avg_gpa": None},
    {"subject": "CS", "course_number": "3704", "title": "Software Engineering", "avg_gpa": None},
])


@pytest.fixture
def store():
    vs = GradeVectorStore()
    vs.rebuild(_GRADES, courses_df=_COURSES)
    return vs


def _has(ctx: str, *tokens: str) -> bool:
    c = ctx.lower()
    return all(t.lower() in c for t in tokens)


def test_course_code_in_results(store):
    ctx = store.query("CS 3114 grade distribution", n_results=5)
    assert _has(ctx, "3114"), f"CS 3114 not found in:\n{ctx}"


def test_professor_name_in_results(store):
    ctx = store.query("Hamouda CS 3114", n_results=5)
    assert _has(ctx, "hamouda") or _has(ctx, "3114"), f"Neither entity in:\n{ctx}"


def test_easiest_query_returns_results(store):
    ctx = store.query("which CS courses are easiest highest GPA", n_results=5)
    assert ctx, "Expected non-empty context"


def test_typo_question_does_not_crash(store):
    ctx = store.query("who is hardest for algorithims", n_results=5)
    assert isinstance(ctx, str)


def test_out_of_dataset_subject_does_not_crash(store):
    ctx = store.query("ECE 2004 grade distribution professor", n_results=5)
    assert isinstance(ctx, str)


def test_major_requirements_query_does_not_crash(store):
    ctx = store.query("what courses do I need for CS major", n_results=5)
    assert isinstance(ctx, str)


def test_hardest_professor_debug(store, capsys):
    """Print retrieved chunks for manual inspection (run with pytest -s)."""
    ctx = store.query("which CS 3114 professor is the hardest", n_results=5)
    print("\n--- Retrieved context ---")
    print(ctx or "(empty)")
    print("---")
    assert True

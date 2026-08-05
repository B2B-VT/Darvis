"""
Regression tests for two bugs where a constraint stated in the question was
silently dropped rather than applied downstream:

1. schedule_builder used the Clerk profile's major even when the question
   named a different one ("build a schedule for a biology student").
2. course_profile always ranked by GPA regardless of sort_goal, and never
   applied a stated time-of-day constraint to the ranked instructor list.
"""

import pandas as pd
import pytest

from app.rag.query_planner import QueryPlanner


class TestExtractRequestedMajor:
    @pytest.mark.parametrize("question,expected", [
        ("Build me a schedule for a biology student without any classes before noon and with 19 credits", "Biology"),
        ("schedule for a mechanical engineering major with 15 credits", "Mechanical Engineering"),
        ("build me a schedule with 15 credits", None),
        ("who is the best professor for CS 1114", None),
    ])
    def test_extracts_major_stated_in_question(self, question, expected):
        assert QueryPlanner._extract_requested_major(question) == expected


@pytest.fixture
def course_profile_grades_df():
    return pd.DataFrame([
        {"Subject": "CS", "Course No.": "1114", "Course Title": "Intro Programming",
         "Instructor": "High GPA Prof", "GPA": 3.9, "A (%)": 30.0, "A- (%)": 5.0,
         "F (%)": 2.0, "Withdraws": 1, "Graded Enrollment": 100,
         "Academic Year": "2024-25", "Term": "Fall"},
        {"Subject": "CS", "Course No.": "1114", "Course Title": "Intro Programming",
         "Instructor": "High A Rate Prof", "GPA": 3.2, "A (%)": 70.0, "A- (%)": 10.0,
         "F (%)": 1.0, "Withdraws": 1, "Graded Enrollment": 100,
         "Academic Year": "2024-25", "Term": "Fall"},
    ])


def test_sort_goal_highest_a_rate_ranks_by_a_rate_not_gpa(course_profile_grades_df):
    from app.features.course_profile import handle_course_profile
    from app.rag.planner_models import QueryPlan

    answer, tables, charts, metadata = handle_course_profile(
        "For CS 1114, which professor has the highest A rate?",
        course_profile_grades_df,
        llm=None,
        vector_store=None,
        min_students=1,
        top_n=5,
        use_recency=False,
        intent=QueryPlan(route="course_profile", subject="CS", course_no="1114", sort_goal="highest_a_rate"),
    )
    # "High A Rate Prof" has the lower GPA but the higher A rate — the old
    # code always sorted by GPA and would have named "High GPA Prof" instead.
    assert "High A Rate Prof" in answer
    assert "High GPA Prof" not in answer.split(".")[0]

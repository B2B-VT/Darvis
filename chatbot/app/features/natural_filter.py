import pandas as pd
from app.data.analytics import natural_filter, detect_natural_params
from app.rag.prompts import build_answer_prompt
from app.utils.charts import table_spec, bar_chart
from app.config import get_settings
from app.features.templated_answers import filter_answer
from app.features.router import smart_display_n

FILTER_COLS = ["Course", "Course Title", "Instructor", "Avg GPA", "Avg A Range (%)", "Avg F Rate (%)", "Total Students", "Terms Taught", "Total Withdraws", "Latest Year", "Confidence Label"]


def handle_natural_filter(
    question: str,
    df: pd.DataFrame,
    llm,
    vector_store,
    top_n: int,
    use_recency: bool,
    intent=None,
    history: list | None = None,
    user_profile: dict | None = None,
):
    settings = get_settings()

    # Pull pre-extracted parameters from intent when available.
    # This replaces detect_natural_params() for routing decisions.
    if intent is not None:
        sort_goal    = intent.sort_goal
        min_students = intent.min_students
        min_gpa      = intent.min_gpa
        min_terms    = intent.min_terms
        subject      = intent.subject
        course_no    = intent.course_no
        level_low    = intent.level_low
        level_high   = intent.level_high
        wants_professors = intent.wants_professors
    else:
        # Keyword fallback — extract everything from the question text
        params = detect_natural_params(question)
        sort_goal    = params.get("sort_goal", "highest_gpa")
        min_students = params.get("min_students", 30)
        min_gpa      = params.get("min_gpa")
        min_terms    = params.get("min_terms")
        subject      = None
        course_no    = None
        level_low    = None
        level_high   = None
        wants_professors = None

    result = natural_filter(
        df, question, top_n, use_recency,
        sort_goal=sort_goal,
        min_students=min_students,
        min_gpa=min_gpa,
        min_terms=min_terms,
        subject=subject,
        course_no=course_no,
        level_low=level_low,
        level_high=level_high,
        wants_professors=wants_professors,
    )

    if result.empty:
        retrieved = vector_store.query(question, n_results=6)
        if retrieved:
            prompt = build_answer_prompt(question, "natural_filter", "", retrieved)
            answer = llm.answer(prompt, history=history)
            if answer:
                return answer, [], [], {}
        # No grade data and no RAG context — let Gemma answer from its own knowledge
        answer = llm.answer(f"Student's question: {question}", history=history)
        if answer:
            return answer, [], [], {}
        return (
            "Darvis doesn't have grade data for that combination yet — "
            "only CS courses are in the dataset right now. "
            "Try asking about a CS course or professor, or broaden your question."
        ), [], [], {}

    cols = [c for c in FILTER_COLS if c in result.columns]
    display_n = (intent.display_n if intent is not None and intent.display_n else None) \
                or smart_display_n(question, top_n)
    result_display = result.head(display_n)

    retrieved = vector_store.query(question, n_results=5)
    table_text = result[cols].to_string(index=False)
    prompt = build_answer_prompt(question, "natural_filter", table_text, retrieved, intent=intent)
    answer = llm.answer(prompt, history=history) or filter_answer(question, result)

    # Map sort goal → (DataFrame column, human-readable chart title).
    # Both ascending and descending GPA sorts use "Avg GPA" as the column but
    # get distinct titles so the chart direction is clear in the UI.
    _goal_to_metric: dict[str, tuple[str, str]] = {
        "highest_gpa":     ("Avg GPA",        "Highest Avg GPA"),
        "lowest_gpa":      ("Avg GPA",         "Lowest Avg GPA"),
        "highest_f_rate":  ("Avg F Rate (%)",  "Highest F Rate"),
        "lowest_f_rate":   ("Avg F Rate (%)",  "Lowest F Rate"),
        "most_withdraws":  ("Total Withdraws", "Most Withdrawals"),
        "lowest_withdraws":("Total Withdraws", "Fewest Withdrawals"),
        "highest_a_rate":  ("Avg A Range (%)", "Highest A/A- Rate"),
        "largest_sample":  ("Total Students",  "Largest Sample Size"),
        "times_taught":    ("Terms Taught",    "Most Terms Taught"),
    }
    metric, chart_label = _goal_to_metric.get(sort_goal, ("Avg GPA", "Avg GPA"))
    _ascending_goals = {"lowest_gpa", "lowest_f_rate", "lowest_withdraws"}
    chart_title = f"Filter Results: {chart_label}"

    label = "Instructor" if "Instructor" in result_display.columns else "Course"
    chart_df = result_display.copy()
    if label == "Instructor" and "Course" in chart_df.columns:
        chart_df["Result Label"] = chart_df["Course"].astype(str) + " | " + chart_df["Instructor"].astype(str)
        label = "Result Label"

    _asc = sort_goal in _ascending_goals
    charts = [bar_chart(chart_title, chart_df.sort_values(metric, ascending=_asc), metric, label, "Results selected by the natural-language filter.")]
    tables = [table_spec("Filter Results", result_display, cols, settings.max_rows_to_llm)]
    return answer, tables, charts, {"sort_goal": sort_goal}

import pandas as pd
import re
from app.data.analytics import natural_filter, detect_natural_params
from app.rag.prompts import build_answer_prompt
from app.utils.charts import table_spec, bar_chart
from app.config import get_settings
from app.features.templated_answers import filter_answer
from app.features.router import smart_display_n

FILTER_COLS = ["Course", "Course Title", "Instructor", "Avg GPA", "Avg A Range (%)", "Avg F Rate (%)", "Total Students", "Terms Taught", "Total Withdraws", "Latest Year", "Confidence Label"]
TOPIC_COURSE_DESCRIPTION_COLS = ["Course", "Course Title", "Description", "Avg GPA", "Avg A Range (%)", "Total Students"]
TOPIC_COURSE_TABLE_COLS = ["Course", "Course Title", "Avg GPA", "Avg A Range (%)", "Total Students"]

_TOPIC_STOPWORDS = {
    "what", "which", "who", "are", "is", "some", "good", "best", "top",
    "courses", "course", "classes", "class", "for", "about", "related",
    "to", "in", "on", "with", "the", "a", "an", "recommend", "recommendations",
    "suggest", "suggestions", "give", "me", "find", "show", "take",
}


def _is_topic_course_recommendation(question: str, intent=None) -> bool:
    q = question.lower()
    asks_courses = any(word in q for word in ("course", "courses", "class", "classes"))
    broad_topic = not re.search(r"\b[A-Za-z]{2,5}\s*-?\s*\d{4}\b", question)
    ranking_only = any(term in q for term in ("highest gpa", "lowest gpa", "a rate", "f rate", "easiest", "hardest"))
    professor_ask = any(term in q for term in ("professor", "instructor", "who teaches"))
    return asks_courses and broad_topic and len(_topic_terms(question)) >= 2 and not ranking_only and not professor_ask


def _topic_terms(question: str) -> list[str]:
    q = re.sub(r"[^a-zA-Z0-9\s]", " ", question.lower())
    terms = [w for w in q.split() if len(w) > 2 and w not in _TOPIC_STOPWORDS]
    # Keep phrase order while de-duping.
    out: list[str] = []
    for term in terms:
        if term not in out:
            out.append(term)
    return out


def _course_stat_lookup(indexes, key: tuple[str, str], attr: str):
    stats = getattr(indexes, "course_stats", {}).get(key) if indexes is not None else None
    return getattr(stats, attr, None) if stats is not None else None


def _topic_course_recommendations(question: str, indexes, limit: int = 3) -> pd.DataFrame:
    if indexes is None:
        return pd.DataFrame()
    terms = _topic_terms(question)
    if not terms:
        return pd.DataFrame()

    phrase = " ".join(terms)
    rows = []
    titles = getattr(indexes, "course_titles", {})
    descriptions = getattr(indexes, "course_descriptions", {})
    for key, title in titles.items():
        description = descriptions.get(key, "")
        hay_title = str(title or "").lower()
        hay_desc = str(description or "").lower()
        haystack = f"{hay_title} {hay_desc}"
        matched = [term for term in terms if term in haystack]
        if not matched:
            continue
        score = len(matched)
        if phrase and phrase in haystack:
            score += 4
        if phrase and phrase in hay_title:
            score += 3
        if all(term in haystack for term in terms):
            score += 2
        rows.append({
            "Course": f"{key[0]} {key[1]}",
            "Course Title": title,
            "Description": description or "Darvis doesn't have a catalog description for this course yet.",
            "Avg GPA": _course_stat_lookup(indexes, key, "weighted_gpa"),
            "Avg A Range (%)": _course_stat_lookup(indexes, key, "a_rate"),
            "Total Students": _course_stat_lookup(indexes, key, "total_students"),
            "_score": score,
        })

    if not rows:
        return pd.DataFrame()
    out = pd.DataFrame(rows)
    out = out.sort_values(
        ["_score", "Total Students", "Avg GPA"],
        ascending=[False, False, False],
        na_position="last",
    )
    return out.head(limit).drop(columns=["_score"])


def _topic_course_answer(question: str, recs: pd.DataFrame) -> str:
    terms = " ".join(_topic_terms(question)) or "that topic"
    intro = f"Here are good {terms} course matches in Darvis:"
    parts = [intro]
    for _, row in recs.iterrows():
        parts.append(
            f"{row['Course']} ({row['Course Title']}): {row['Description']}"
        )
    parts.append("These are topic matches first; grade outcomes are supporting context in the table, not the reason they were selected.")
    return " ".join(parts)


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
    indexes=None,
):
    settings = get_settings()

    if _is_topic_course_recommendation(question, intent=intent):
        recs = _topic_course_recommendations(question, indexes, limit=3)
        if not recs.empty:
            description_display = recs[TOPIC_COURSE_DESCRIPTION_COLS]
            table_display = recs[TOPIC_COURSE_TABLE_COLS]
            return (
                _topic_course_answer(question, description_display),
                [table_spec("Course Recommendations", table_display, TOPIC_COURSE_TABLE_COLS, len(table_display))],
                [],
                {"route": "natural_filter", "recommendation_mode": "topic_courses"},
            )

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
        return (
            "Darvis doesn't have grade data for that combination yet. Try broadening "
            "your filter — for example, remove a GPA or enrollment minimum — or ask "
            "about a specific course or professor."
        ), [], [], {}

    cols = [c for c in FILTER_COLS if c in result.columns]
    display_n = (intent.display_n if intent is not None and intent.display_n else None) \
                or smart_display_n(question, top_n)
    result_display = result.head(display_n)

    retrieved = vector_store.query(question, n_results=5)
    table_text = result_display[cols].to_string(index=False)
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

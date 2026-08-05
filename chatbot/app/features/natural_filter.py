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
    "i", "im", "am", "my", "student", "students", "interested", "interest",
    "should", "could", "would", "can", "want", "wanna", "need",
    # Day/time/connector words — verified live these leaked into the
    # displayed sentence and corrupted relevance scoring on schedule/time
    # questions ("good that fit between and monday wednesday course
    # matches"), because they were treated as topic search terms.
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "before", "after", "between", "fit", "not", "too", "early", "and", "or",
    "has", "have", "decent", "outcomes", "this", "that", "brand",
    "new", "morning", "evening", "mornin", "pm",
}

_AI_ML_TERMS = {
    "ai", "ml", "artificial", "intelligence", "machine", "learning",
    "neural", "deep", "supervised", "unsupervised", "classification",
    "regression", "data", "mining", "model", "models",
}

_MAJOR_SUBJECTS = {
    "computer science": {"CS", "CMDA", "MATH", "STAT", "ECE"},
    "cs": {"CS", "CMDA", "MATH", "STAT", "ECE"},
    "business information technology": {"BIT", "CMDA", "STAT", "CS"},
    "bit": {"BIT", "CMDA", "STAT", "CS"},
}


def _has_time_or_day_constraint(question: str) -> bool:
    q = question.lower()
    return bool(re.search(
        r"\b(before|after|between|morning|evening|mornin|monday|tuesday|wednesday|thursday|friday|"
        r"\d{1,2}\s*(am|pm))\b",
        q,
    ))


def _is_topic_course_recommendation(question: str, intent=None) -> bool:
    q = question.lower()
    asks_courses = any(word in q for word in ("course", "courses", "class", "classes"))
    broad_topic = not re.search(r"\b[A-Za-z]{2,5}\s*-?\s*\d{4}\b", question)
    # "cooked"/"chill"/"brutal" etc. are difficulty-slang, not a topic search —
    # verified live that "what class is least cooked" (slang for easiest/
    # lowest-risk) fell into this topic-matching path instead of the GPA-sort
    # path, and returned the LOWEST-GPA courses in the dataset — the opposite
    # of what the slang means — because this path has no risk/difficulty
    # awareness at all, only keyword-vs-description matching.
    ranking_only = any(term in q for term in (
        "highest gpa", "lowest gpa", "a rate", "f rate", "easiest", "hardest",
        "cooked", "chill", "brutal", "easy a", "curve",
    ))
    professor_ask = any(term in q for term in ("professor", "instructor", "who teaches"))
    # A schedule/time-window question ("classes that fit between 1-4pm on
    # Monday and Wednesday") isn't a topic recommendation even though it
    # mentions "classes" — it needs section_lookup/schedule_builder's actual
    # time data, which this handler doesn't have.
    if _has_time_or_day_constraint(question):
        return False
    return asks_courses and broad_topic and len(_topic_terms(question)) >= 2 and not ranking_only and not professor_ask


def _topic_terms(question: str) -> list[str]:
    q = re.sub(r"[^a-zA-Z0-9\s]", " ", question.lower())
    terms = [w for w in q.split() if (len(w) > 2 or w in {"ai", "ml"}) and w not in _TOPIC_STOPWORDS]
    # Keep phrase order while de-duping.
    out: list[str] = []
    for term in terms:
        if term not in out:
            out.append(term)
    return out


def _expanded_topic_terms(terms: list[str]) -> set[str]:
    expanded = set(terms)
    has_ai = "ai" in expanded or ("artificial" in expanded and "intelligence" in expanded)
    has_ml = "ml" in expanded or ("machine" in expanded and "learning" in expanded)
    if has_ai or has_ml:
        expanded |= _AI_ML_TERMS
    return expanded


def _major_hint(question: str, user_profile: dict | None = None) -> str:
    q = question.lower()
    if re.search(r"\b(?:cs|computer science)\s+(?:student|major)\b", q) or re.search(r"\bmajor(?:ing)?\s+in\s+(?:cs|computer science)\b", q):
        return "computer science"
    if re.search(r"\b(?:bit|business information technology)\s+(?:student|major)\b", q) or re.search(r"\bmajor(?:ing)?\s+in\s+(?:bit|business information technology)\b", q):
        return "business information technology"
    major = str((user_profile or {}).get("major") or "").strip().lower()
    if "computer science" in major or major == "cs":
        return "computer science"
    if "business information technology" in major or major == "bit":
        return "business information technology"
    return ""


def _preferred_subjects_for_major(major_hint: str) -> set[str]:
    for key, subjects in _MAJOR_SUBJECTS.items():
        if key in major_hint:
            return subjects
    return set()


def _course_stat_lookup(indexes, key: tuple[str, str], attr: str):
    stats = getattr(indexes, "course_stats", {}).get(key) if indexes is not None else None
    return getattr(stats, attr, None) if stats is not None else None


def _topic_course_recommendations(question: str, indexes, limit: int = 3, user_profile: dict | None = None) -> pd.DataFrame:
    if indexes is None:
        return pd.DataFrame()
    terms = _topic_terms(question)
    if not terms:
        return pd.DataFrame()

    phrase = " ".join(terms)
    expanded_terms = _expanded_topic_terms(terms)
    preferred_subjects = _preferred_subjects_for_major(_major_hint(question, user_profile))
    rows = []
    titles = getattr(indexes, "course_titles", {})
    descriptions = getattr(indexes, "course_descriptions", {})
    for key, title in titles.items():
        if preferred_subjects and key[0] not in preferred_subjects:
            continue
        description = descriptions.get(key, "")
        hay_title = str(title or "").lower()
        hay_desc = str(description or "").lower()
        haystack = f"{hay_title} {hay_desc}"
        matched = [term for term in expanded_terms if term in haystack]
        original_matched = [term for term in terms if term in haystack]
        if not matched:
            continue
        if len(original_matched) == 0 and not ({"ai", "ml"} & set(terms)):
            continue
        if len(matched) < 2 and not phrase:
            continue
        score = len(matched)
        if phrase and phrase in haystack:
            score += 4
        if phrase and phrase in hay_title:
            score += 3
        if all(term in haystack for term in terms if term not in {"ai", "ml"}):
            score += 2
        if key[0] == "CS":
            score += 5
        elif key[0] == "CMDA":
            score += 2
        if "machine learning" in haystack or "artificial intelligence" in haystack:
            score += 5
        elif any(term in haystack for term in ("neural", "supervised", "unsupervised", "classification")):
            score += 3
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
    parts = []
    for _, row in recs.iterrows():
        parts.append(
            f"{row['Course']} ({row['Course Title']}): {row['Description']}"
        )
    return "\n\n".join(parts)


def time_constrained_instructors(sections_df, question: str) -> set[str] | None:
    """
    Returns the set of lowercase instructor last names teaching at least one
    section within the question's stated time window, or None if the
    question has no time constraint. handle_natural_filter previously had no
    access to sections_df at all — verified live that time-constrained
    questions ("which professors teach after 3 PM?", "not before 11") fell
    through to a false "Darvis doesn't have that data" claim even though
    sections.start_time is fully populated (10,663 Fall 2026 rows).
    """
    from app.features.schedule_builder import parse_time_constraints

    q = question.lower()
    if not re.search(r"\b(before|after|between|morning|evening|\d{1,2}\s*(am|pm))\b", q):
        return None
    if sections_df is None or sections_df.empty:
        return set()
    start_limit, end_limit = parse_time_constraints(question)
    if (start_limit, end_limit) == ("07:00", "22:00"):
        return None  # no actual time constraint detected despite the keyword hit
    sdf = sections_df
    sdf = sdf[sdf["start_time"].notna() & sdf["end_time"].notna()]
    sdf = sdf[(sdf["start_time"] >= start_limit) & (sdf["end_time"] <= end_limit)]
    return {
        str(n).strip().split()[-1].lower()
        for n in sdf["instructor"].dropna()
        if str(n).strip() and str(n).strip().upper() not in ("STAFF", "TBA")
    }


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
    sections_df=None,
):
    settings = get_settings()

    if _is_topic_course_recommendation(question, intent=intent):
        recs = _topic_course_recommendations(question, indexes, limit=3, user_profile=user_profile)
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

    qualifying_instructors = time_constrained_instructors(sections_df, question)
    if qualifying_instructors is not None and "Instructor" in result.columns:
        if not qualifying_instructors:
            return (
                "I couldn't check Fall 2026 section times right now — try the Schedule page directly."
            ), [], [], {}
        result = result[
            result["Instructor"].astype(str).str.strip().str.split().str[-1].str.lower().isin(qualifying_instructors)
        ]

    if result.empty:
        if qualifying_instructors is not None:
            return (
                "None of the instructors matching your other criteria have a Fall 2026 section "
                "in that time window. Try relaxing the time constraint or checking the Schedule page."
            ), [], [], {}
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

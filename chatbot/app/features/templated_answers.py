"""
Template-based answer generation.

These functions produce clean, natural-language text responses directly from
DataFrame results — no LLM call required. They serve two purposes:
  1. Primary fallback when the LLM client fails (quota, timeout, etc.)
  2. Fast, guaranteed-accurate answers for straightforward data queries

All functions return a plain string ready to be used as the `answer` field
in the ChatResponse.
"""

import pandas as pd

# Keywords that signal the user wants a comparison / ranking
_RANKING_WORDS = {
    "strongest", "best", "highest", "top", "which", "who",
    "worst", "lowest", "weakest", "compare", "comparison",
}

_DISCLAIMER = (
    "Grade distributions show you outcome patterns, not what the class actually feels like to sit through."
)


def _is_ranking_question(question: str) -> bool:
    q = question.lower()
    return any(w in q for w in _RANKING_WORDS)


def _fmt_gpa(v) -> str:
    try:
        return f"{float(v):.2f}"
    except (TypeError, ValueError):
        return str(v)


def _fmt_pct(v) -> str:
    try:
        return f"{float(v):.1f}%"
    except (TypeError, ValueError):
        return str(v)


def _confidence_tag(row) -> str:
    label = str(row.get("Confidence Label", "")).strip()
    return f" ({label} confidence)" if label and label != "nan" else ""


def course_answer(
    question: str,
    result: pd.DataFrame,
    subject: str | None,
    course_no: str,
    sort_ascending: bool = False,
) -> str:
    """
    Generate a natural-language answer for a course-profile query.

    `result` is already sorted: ascending GPA (hardest first) when sort_ascending=True,
    descending GPA (best first) otherwise.
    """
    course_label = f"{subject} {course_no}".strip() if subject else course_no

    if result.empty:
        return (
            f"I don't have enough grade data for {course_label} with the current filters. "
            "Try lowering the minimum-student threshold in Settings, or check if the course "
            "code is correct."
        )

    top = result.iloc[0]
    top_name = top.get("Instructor", "the top instructor")
    top_gpa = _fmt_gpa(top.get("Avg GPA"))
    top_a = _fmt_pct(top.get("Avg A Range (%)"))
    top_f = _fmt_pct(top.get("Avg F Rate (%)")) if "Avg F Rate (%)" in result.columns else None
    top_terms = int(top.get("Terms Taught", 0))
    top_students = int(top.get("Total Students", 0))
    conf = _confidence_tag(top)
    term_word = "term" if top_terms == 1 else "terms"

    if _is_ranking_question(question) and len(result) > 1:
        second = result.iloc[1]
        s2_name = second.get("Instructor", "the next instructor")
        s2_gpa = _fmt_gpa(second.get("Avg GPA"))
        s2_conf = _confidence_tag(second)

        if sort_ascending:
            f_note = f" and a {top_f} F rate" if top_f else ""
            parts = [
                f"For {course_label}, {top_name} has the toughest grade outcomes on record "
                f"— {top_gpa} average GPA{f_note} across "
                f"{top_students:,} students over {top_terms} {term_word}{conf}.",
            ]
        else:
            parts = [
                f"For {course_label}, {top_name} has the strongest grade outcomes in the dataset "
                f"— {top_gpa} average GPA and a {top_a} A/A− rate across "
                f"{top_students:,} students over {top_terms} {term_word}{conf}.",
            ]

        if len(result) > 2:
            parts.append(f"{s2_name} is worth considering too, averaging {s2_gpa} GPA{s2_conf}.")
        else:
            parts.append(f"{s2_name} is the only other instructor in the data, averaging {s2_gpa}{s2_conf}.")

        parts.append(_DISCLAIMER)
        return " ".join(parts)

    else:
        if sort_ascending:
            f_note = f" and a {top_f} F rate" if top_f else ""
            parts = [
                f"{top_name} has the toughest grade outcomes on record for {course_label} "
                f"— {top_gpa} average GPA{f_note} across "
                f"{top_students:,} students over {top_terms} {term_word}{conf}.",
            ]
        else:
            parts = [
                f"{top_name} has the top grade outcomes for {course_label} "
                f"— {top_gpa} average GPA and a {top_a} A/A− rate across "
                f"{top_students:,} students over {top_terms} {term_word}{conf}.",
            ]
        if len(result) > 1:
            others = result.iloc[1:3]
            names = ", ".join(r.get("Instructor", "?") for _, r in others.iterrows())
            parts.append(f"Other instructors in the dataset include {names}.")
        parts.append(_DISCLAIMER)
        return " ".join(parts)


def professor_answer(question: str, result: pd.DataFrame, prof_name: str, rmp: dict | None = None) -> str:
    """
    Generate a natural-language answer for a professor-profile query.

    `result` rows each represent one course taught by the matched professor.
    `rmp` is an optional dict with rmp_rating, rmp_difficulty, rmp_count, rmp_tags.
    """
    if result.empty:
        base = (
            f"I couldn't find grade data for a professor matching \"{prof_name}\". "
            "Try a shorter name or just the last name — for example, \"Hamouda\" rather than "
            "\"Professor Hamouda\"."
        )
        if rmp and rmp.get("rmp_rating") is not None:
            base += (
                f" Their Rate My Professors rating is {rmp['rmp_rating']}/5.0 "
                f"based on {rmp['rmp_count']} reviews."
            )
        return base

    n_courses = len(result)
    total_students = int(result.get("Total Students", pd.Series([0])).sum())

    # Best course by Avg GPA
    best_idx = result["Avg GPA"].idxmax()
    best = result.loc[best_idx]
    best_course = best.get("Course", "an unlisted course")
    best_gpa = _fmt_gpa(best.get("Avg GPA"))
    best_a = _fmt_pct(best.get("Avg A Range (%)"))
    overall_gpa = _fmt_gpa(result["Avg GPA"].mean())
    course_word = "course" if n_courses == 1 else "courses"

    parts = [
        f"{prof_name} has taught {n_courses} {course_word} in this dataset, "
        f"with an overall average GPA of {overall_gpa} across {total_students:,} students.",
        f"Their strongest grade outcomes appear in {best_course} "
        f"(avg GPA {best_gpa}, {best_a} A/A− rate).",
    ]

    # Append RMP snippet if available
    if rmp and rmp.get("rmp_rating") is not None:
        rmp_line = (
            f"On Rate My Professors, they hold a {rmp['rmp_rating']}/5.0 quality rating "
            f"and {rmp['rmp_difficulty']}/5.0 difficulty score across {rmp['rmp_count']} reviews."
        )
        if rmp.get("rmp_tags"):
            rmp_line += f" Students most often describe them as: {', '.join(rmp['rmp_tags'][:4])}."
        parts.append(rmp_line)

    parts.append(_DISCLAIMER)
    return " ".join(parts)


def filter_answer(question: str, result: pd.DataFrame) -> str:
    """
    Fallback for the natural_filter route when the LLM is unavailable.
    Produces a brief plain-text summary of the top results.
    """
    if result.empty:
        return (
            "No matching results were found with the current filters. "
            "Try lowering the minimum-student threshold in Settings, or broaden your query."
        )

    n = len(result)
    has_instructor = "Instructor" in result.columns
    top = result.iloc[0]

    if has_instructor:
        name = top.get("Instructor", "the top result")
        course = top.get("Course", "")
        label = f"{name} ({course})" if course else name
    else:
        label = top.get("Course", "the top result")

    top_gpa = _fmt_gpa(top.get("Avg GPA"))
    top_a   = _fmt_pct(top.get("Avg A Range (%)"))
    conf    = _confidence_tag(top)

    parts = [
        f"{label} comes out on top — {top_gpa} average GPA and a {top_a} A/A− rate{conf}."
    ]

    if n > 1:
        runner = result.iloc[1]
        r_label = (
            f"{runner.get('Instructor', '?')} ({runner.get('Course', '')})"
            if has_instructor else runner.get("Course", "?")
        )
        r_gpa = _fmt_gpa(runner.get("Avg GPA"))
        parts.append(f"{r_label} is close behind at {r_gpa} GPA.")

    parts.append(_DISCLAIMER)
    return " ".join(parts)


def general_answer(question: str) -> str:
    """
    Fallback for the general_rag route when the LLM is unavailable and no
    specific data was retrieved.
    """
    q = question.lower()

    # Detect if the user seems to be asking about something out of scope
    off_topic = any(w in q for w in ["hello", "hi", "hey", "how are you", "what can you do"])
    if off_topic:
        return (
            "I'm Darvis, a grade-distribution assistant. Ask me about any course or professor "
            "and I'll show you historical GPA, A/A− rates, F rates, and enrollment trends. "
            "For example: \"Which CS 3114 professor has the strongest outcomes?\" or "
            "\"How has the A rate in ECE 2004 changed over time?\""
        )

    return (
        "I can work with historical grade distributions — GPA, A/A− rates, F rates, "
        "withdrawals, and enrollment counts. Try asking about a specific course (e.g. \"CS 3114\") "
        "or a professor by last name. "
        "For student opinions beyond the numbers, check the Forums page."
    )

import re
import pandas as pd
from app.data.analytics import professor_profile
from app.features.router import extract_professor_name_from_profile_question
from app.rag.prompts import build_answer_prompt, build_rag_only_prompt
from app.utils.charts import table_spec, bar_chart, scatter_chart
from app.config import get_settings
from app.features.templated_answers import professor_answer

PROF_COLS = [
    "Course", "Course Title",
    "Avg GPA", "Avg A Range (%)", "Avg F Rate (%)",
    "Total Students", "Terms Taught", "Total Withdraws", "Latest Year",
    "Confidence Label",
]


def _lookup_rmp(name: str, rmp_df: pd.DataFrame | None) -> dict | None:
    """
    Return a dict with rmp_rating, rmp_difficulty, rmp_count, rmp_tags
    for the best-matching professor name, or None if no match / no data.
    """
    if rmp_df is None or rmp_df.empty:
        return None

    key = name.lower().strip()

    # Exact key match first
    row = rmp_df[rmp_df["_key"] == key]
    if row.empty:
        # Word-boundary match on last name to avoid "Lewis" matching "Lewison"
        last = key.split()[-1]
        pattern = r'\b' + re.escape(last) + r'\b'
        row = rmp_df[rmp_df["_key"].str.contains(pattern, regex=True, na=False)]
        if not row.empty and len(row) > 1:
            # Multiple people share this last name — prefer most-reviewed (most likely match)
            row = row.sort_values("rmp_count", ascending=False)
    if row.empty:
        return None

    r = row.iloc[0]
    return {
        "rmp_rating":     float(r["rmp_rating"]) if pd.notna(r["rmp_rating"]) else None,
        "rmp_difficulty": float(r["rmp_difficulty"]) if pd.notna(r["rmp_difficulty"]) else None,
        "rmp_count":      int(r["rmp_count"]) if pd.notna(r["rmp_count"]) else 0,
        "rmp_tags":       r["rmp_tags"] if isinstance(r["rmp_tags"], list) else [],
    }


def _rmp_summary(rmp: dict | None) -> str:
    """Build a short text snippet to inject into the LLM prompt."""
    if not rmp or rmp["rmp_rating"] is None:
        return ""
    tags_str = (", ".join(rmp["rmp_tags"][:4])) if rmp["rmp_tags"] else "no tags"
    return (
        f"\n\nRate My Professors data ({rmp['rmp_count']} ratings): "
        f"Overall quality {rmp['rmp_rating']}/5.0, "
        f"difficulty {rmp['rmp_difficulty']}/5.0. "
        f"Top student tags: {tags_str}."
    )


def _build_prof_sections_table(sections_df, canonical_name: str) -> list:
    """Return a table_spec for Fall 2026 sections taught by this professor, or []."""
    if sections_df is None or sections_df.empty or not canonical_name:
        return []
    from app.utils.charts import table_spec as _ts
    _DAY_MAP = {"M": "Mon", "T": "Tue", "W": "Wed", "R": "Thu", "F": "Fri"}

    def _fmt_days(days):
        if not days:
            return "TBA"
        return "".join(_DAY_MAP.get(d, d) for d in (days if isinstance(days, list) else []))

    def _fmt_time(t):
        if not t:
            return "TBA"
        try:
            h, m = int(t.split(":")[0]), int(t.split(":")[1])
            return f"{h % 12 or 12}:{m:02d} {'AM' if h < 12 else 'PM'}"
        except Exception:
            return t

    rows = sections_df[sections_df["instructor"].str.lower() == canonical_name.lower()]
    if rows.empty:
        return []

    records = []
    for _, r in rows.iterrows():
        seats = r.get("seats")
        enrolled = r.get("enrolled")
        capacity = (int(seats) + int(enrolled)) if pd.notna(seats) and pd.notna(enrolled) else None
        records.append({
            "Course": f"{r.get('subject', '')} {r.get('course_number', '')}".strip(),
            "Title": r.get("title") or "—",
            "Days": _fmt_days(r.get("days")),
            "Time": _fmt_time(r.get("start_time")),
            "Location": r.get("location") or "TBA",
            "Open Seats": int(seats) if pd.notna(seats) else "—",
            "Capacity": capacity if capacity is not None else "—",
        })

    if not records:
        return []
    sec_df = pd.DataFrame(records)
    cols = ["Course", "Title", "Days", "Time", "Location", "Open Seats", "Capacity"]
    return [_ts("Fall 2026 Schedule", sec_df, cols, len(records))]


def handle_professor_profile(
    question: str,
    df: pd.DataFrame,
    llm,
    vector_store,
    min_students: int,
    top_n: int,
    use_recency: bool,
    rmp_df: pd.DataFrame | None = None,
    intent=None,
    history: list | None = None,
    user_profile: dict | None = None,
    sections_df=None,
):
    settings = get_settings()
    # Use LLM-extracted name if available; fall back to regex
    name = (intent.professor_name if intent is not None and intent.professor_name else None) \
           or extract_professor_name_from_profile_question(question)
    if name is None:
        answer = llm.answer(f"Question: {question}", history=history) or (
            "I couldn't identify a professor name in your question. "
            "Try asking with just the last name — for example, \"Hamouda\" or \"Professor Shaffer\"."
        )
        return answer, [], [], {"professor_query": None}
    result = professor_profile(df, name, min_students, use_recency).head(top_n)

    # If the question targets a specific course, scope the table to just that course
    course_filter = (intent.course_no if intent is not None else None)
    if course_filter and not result.empty and "Course" in result.columns:
        narrowed = result[result["Course"].astype(str).str.strip() == str(course_filter).strip()]
        if not narrowed.empty:
            result = narrowed

    # Pull RMP data for this professor
    rmp = _lookup_rmp(name, rmp_df)

    prof_sections = _build_prof_sections_table(sections_df, name)

    if result.empty:
        retrieved = vector_store.query(question, n_results=6)
        prompt = build_rag_only_prompt(question, retrieved, intent=intent) if retrieved else f"Student's question: {question}"
        answer = llm.answer(prompt, history=history) or professor_answer(question, result, name, rmp=rmp)
        return answer, prof_sections, [], {"professor_query": name, "rmp": rmp}

    table_text = result[PROF_COLS].to_string(index=False)
    rmp_text   = _rmp_summary(rmp)
    # Skip vector retrieval — the per-course table + RMP snippet is complete
    # for a professor question; retrieval added latency without new facts.
    prompt     = build_answer_prompt(question, "professor_profile", table_text + rmp_text, "", intent=intent)
    answer     = llm.answer(prompt, max_tokens=350, history=history) or professor_answer(question, result, name, rmp=rmp)

    charts = [
        bar_chart(
            f"Average GPA by Course for {name}",
            result.sort_values("Avg GPA", ascending=True),
            "Avg GPA", "Course",
            "Courses taught by the matched professor.",
        ),
        scatter_chart(
            f"A/A- Rate vs F Rate for {name}",
            result,
            "Avg F Rate (%)", "Avg A Range (%)",
            "Each point is a course taught by the matched professor.",
        ),
    ]
    tables = [table_spec("Professor Course Summary", result, PROF_COLS, settings.max_rows_to_llm)] + prof_sections
    return answer, tables, charts, {"professor_query": name, "rmp": rmp}

import pandas as pd
from app.data.analytics import course_profile, extract_course_parts
from app.rag.prompts import build_answer_prompt, build_rag_only_prompt
from app.utils.charts import table_spec, bar_chart, scatter_chart
from app.config import get_settings
from app.features.templated_answers import course_answer
from app.features.router import smart_display_n

COURSE_COLS = ["Instructor", "Avg GPA", "Avg A Range (%)", "Avg F Rate (%)", "Total Students", "Terms Taught", "Total Withdraws", "Latest Year", "Confidence Label"]
COURSE_COLS_RMP = ["Instructor", "Avg GPA", "Avg A Range (%)", "Avg F Rate (%)", "Total Students", "Terms Taught", "RMP Rating", "Confidence Label"]

_RMP_KEYWORDS = {"rate my professor", "rmp rating", "rmp score", "rated", "rmp"}


def _is_rmp_question(question: str) -> bool:
    q = question.lower()
    return any(kw in q for kw in _RMP_KEYWORDS)


def _enrich_with_rmp(result: pd.DataFrame, rmp_df: pd.DataFrame | None) -> pd.DataFrame:
    """Join RMP ratings onto the instructor result rows by last-name lookup."""
    if rmp_df is None or rmp_df.empty:
        return result

    def _lookup(name: str):
        if not isinstance(name, str):
            return None
        key = name.lower().strip()
        row = rmp_df[rmp_df["_key"] == key]
        if row.empty:
            return None
        val = row.iloc[0]["rmp_rating"]
        return float(val) if pd.notna(val) else None

    result = result.copy()
    result["RMP Rating"] = result["Instructor"].apply(_lookup)
    return result


def _build_sections_table(sections_df: "pd.DataFrame | None", subject: str, course_no: str) -> list:
    """Return a table_spec list for Fall 2026 sections of a given course, or []."""
    if sections_df is None or sections_df.empty:
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

    rows = sections_df[
        (sections_df["subject"].str.upper() == subject.upper()) &
        (sections_df["course_number"].astype(str) == str(course_no))
    ]
    if rows.empty:
        return []

    records = []
    for _, r in rows.iterrows():
        seats = r.get("seats")
        open_seats = r.get("open_seats")
        capacity = int(seats) if pd.notna(seats) else None
        records.append({
            "Instructor": r.get("instructor") or "TBA",
            "Days": _fmt_days(r.get("days")),
            "Time": _fmt_time(r.get("start_time")),
            "Location": r.get("location") or "TBA",
            "Open Seats": int(open_seats) if pd.notna(open_seats) else "—",
            "Capacity": capacity if capacity is not None else "—",
            "CRN": r.get("crn") or "—",
        })

    if not records:
        return []
    sec_df = pd.DataFrame(records)
    cols = ["Instructor", "Days", "Time", "Location", "Open Seats", "Capacity", "CRN"]
    return [_ts("Fall 2026 Sections", sec_df, cols, len(records))]


def _course_level_aggregate(result: pd.DataFrame, subject: str | None, course_no: str) -> dict:
    """Collapse a per-instructor course_profile() result into one course-level row,
    weighted by student count so a comparison reflects the whole course, not just
    whichever instructor happens to sort first."""
    label = f"{subject or ''} {course_no}".strip()
    if result.empty:
        return {
            "Course": label, "Avg GPA": "No data", "Avg A Range (%)": "No data",
            "Avg F Rate (%)": "No data", "Total Students": 0, "Instructors": 0,
        }
    total_students = result["Total Students"].sum()

    def _wavg(col):
        return round((result[col] * result["Total Students"]).sum() / total_students, 3) if total_students else 0

    return {
        "Course": label,
        "Avg GPA": _wavg("Avg GPA"),
        "Avg A Range (%)": _wavg("Avg A Range (%)"),
        "Avg F Rate (%)": _wavg("Avg F Rate (%)"),
        "Total Students": int(total_students),
        "Instructors": len(result),
    }


def _handle_course_comparison(
    question: str,
    df: pd.DataFrame,
    llm,
    courses: list[tuple[str, str]],
    min_students: int,
    use_recency: bool,
    intent=None,
    history: list | None = None,
):
    """Two-or-more-course comparison ("compare CS 2114 and CS 1114 grades") — the
    single-course path below only reads intent.subject/course_no (singular), so a
    multi-course question silently profiled just one course while the LLM, given
    only that one course's data, correctly said it couldn't compare — producing a
    contradictory answer next to a single-course table. This gives the LLM (and the
    table) data for every requested course instead of just the first one."""
    settings = get_settings()
    agg_rows, per_course = [], []
    for subj, cno in courses:
        result = course_profile(df, subj, cno, min_students, use_recency)
        agg_rows.append(_course_level_aggregate(result, subj, cno))
        per_course.append((subj, cno, result))

    comp_df = pd.DataFrame(agg_rows)
    cols = ["Course", "Avg GPA", "Avg A Range (%)", "Avg F Rate (%)", "Total Students", "Instructors"]
    table_text = comp_df[cols].to_string(index=False)

    prompt = build_answer_prompt(question, "course_profile", table_text, "", intent=intent)
    answer = llm.answer(prompt, max_tokens=700, history=history) or ("Course comparison:\n" + table_text)

    tables = [table_spec("Course Comparison", comp_df, cols, settings.max_rows_to_llm)]
    for subj, cno, result in per_course:
        if not result.empty:
            tables.append(table_spec(f"{subj} {cno} — Professor Summary", result, COURSE_COLS, settings.max_rows_to_llm))

    return answer, tables, [], {"comparison_courses": [f"{s} {c}" for s, c in courses]}


def handle_course_profile(
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
    sections_df: pd.DataFrame | None = None,
    indexes=None,
):
    settings = get_settings()

    # Multi-course comparison ("compare CS 2114 and CS 1114 grades") — must be
    # checked before the single-course extraction below, which only reads
    # intent.subject/course_no and would silently drop every course but one.
    if intent is not None and intent.requested_courses:
        distinct = list(dict.fromkeys(
            (s.upper(), c) for s, c in intent.requested_courses if s and c
        ))
        if len(distinct) >= 2:
            return _handle_course_comparison(
                question, df, llm, distinct, min_students, use_recency,
                intent=intent, history=history,
            )

    # Use LLM-extracted course parts if available; fall back to regex
    if intent is not None and intent.course_no:
        subject = intent.subject
        course_no = intent.course_no
    else:
        subject, course_no = extract_course_parts(question)

    if not course_no:
        return None

    # Use intent sort goal for result ordering. Also check question keywords directly —
    # intent extraction can miss sort_goal when the question has unrecognized tokens,
    # so the keyword check is a safety net for cases like "wwich prof is hardest".
    _q = question.lower()
    _hardest_kws = {"hardest", "hard", "brutal", "tough", "avoid", "worst", "bad", "difficult"}
    sort_ascending = (
        (intent is not None and intent.sort_goal in ("lowest_gpa", "highest_f_rate"))
        or any(w in _q for w in _hardest_kws)
    )

    result_all = course_profile(df, subject, course_no, min_students, use_recency)

    description = ""
    if indexes is not None and subject and course_no:
        description = indexes.course_descriptions.get((subject.upper(), course_no.strip()), "") or ""

    if sort_ascending and not result_all.empty and "Avg GPA" in result_all.columns:
        # For "hardest/worst" queries: sort ALL instructors by ascending GPA first so the
        # actual worst instructor is included, then take top_n. Without this, .head(top_n)
        # on the best-first default sort would exclude the worst instructors entirely.
        result = result_all.sort_values(
            ["Avg GPA", "Total Students"], ascending=[True, False]
        ).head(top_n)
    else:
        result = result_all.head(top_n)

    if result.empty:
        retrieved = vector_store.query(question, n_results=6) or description
        prompt = build_rag_only_prompt(question, retrieved, intent=intent) if retrieved else f"Student's question: {question}"
        answer = llm.answer(prompt, history=history) or course_answer(question, result, subject, course_no, sort_ascending=sort_ascending)
        sec_tables = _build_sections_table(sections_df, subject, course_no)
        return answer, sec_tables, [], {"subject": subject, "course_no": course_no}

    # RMP question detection — prefer intent flag, fall back to keyword check
    rmp_question = (intent.wants_rmp if intent is not None else False) or _is_rmp_question(question)

    # Display count — prefer intent hint, fall back to smart_display_n
    display_n = (intent.display_n if intent is not None and intent.display_n else None) \
                or smart_display_n(question, top_n)

    if rmp_question:
        result = _enrich_with_rmp(result, rmp_df)
        if "RMP Rating" in result.columns:
            # Sort by RMP rating when available, fall back to GPA for unrated instructors
            result = result.sort_values(
                ["RMP Rating", "Avg GPA"], ascending=[False, False], na_position="last"
            )
        # Show both grade data AND RMP — don't strip grade data just because RMP was asked for.
        result_display = result.head(display_n)
        cols = COURSE_COLS_RMP
        table_text = result_display[cols].to_string(index=False)
    else:
        result_display = result.head(display_n)
        cols = COURSE_COLS
        table_text = result_display[cols].to_string(index=False)

    # Annotate the table so the LLM knows what "position 1" means.
    # Without this, the LLM assumes the top row = best professor regardless of sort direction.
    if sort_ascending:
        table_text += "\n[Sorted: lowest GPA first — professor at top has WORST grade outcomes (hardest)]"
    else:
        table_text += "\n[Sorted: highest GPA first — professor at top has BEST grade outcomes]"

    # Skip vector retrieval — the analytics table already contains everything
    # needed for a course question. Retrieval here added 100-500ms plus an
    # optional LLM-judge call without changing the answer. The scraped catalog
    # description is cheap (already in memory) and lets "what is X about"
    # questions get answered instead of just grade/instructor comparisons.
    prompt = build_answer_prompt(question, "course_profile", table_text, description, intent=intent)
    answer = llm.answer(prompt, max_tokens=700, history=history) or course_answer(question, result, subject, course_no, sort_ascending=sort_ascending)

    charts = [
        bar_chart(f"Average GPA by Professor for {subject or ''} {course_no}".strip(), result_display.sort_values("Avg GPA", ascending=True), "Avg GPA", "Instructor", "Recency-weighted when requested."),
        scatter_chart(f"A/A- Rate vs F Rate for {subject or ''} {course_no}".strip(), result_display, "Avg F Rate (%)", "Avg A Range (%)", "Bubble data includes students and confidence fields."),
        bar_chart(f"Sample Size by Professor for {subject or ''} {course_no}".strip(), result_display.sort_values("Total Students", ascending=True), "Total Students", "Instructor", "More students usually means more reliable grade-outcome data."),
    ]
    sec_tables = _build_sections_table(sections_df, subject, course_no)
    tables = [table_spec("Professor Summary", result_display, cols, settings.max_rows_to_llm)] + sec_tables
    return answer, tables, charts, {"subject": subject, "course_no": course_no}

import re

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
_COMPARISON_KEYWORDS = {"compare", "comparison", "vs", "versus", "difference", "differences"}


def _is_rmp_question(question: str) -> bool:
    q = question.lower()
    return any(kw in q for kw in _RMP_KEYWORDS)


def _is_about_course_question(question: str) -> bool:
    q = question.lower()
    return any(phrase in q for phrase in ("tell me about", "what is", "what's", "describe", "about "))


def _is_course_comparison_question(question: str) -> bool:
    q = question.lower()
    return any(kw in q for kw in _COMPARISON_KEYWORDS)


def _clean_text(value, default: str = "") -> str:
    if value is None:
        return default
    try:
        if pd.isna(value):
            return default
    except Exception:
        pass
    text = str(value).strip()
    return text if text and text.lower() not in {"nan", "none"} else default


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
            "Instructor": _clean_text(r.get("instructor"), "TBA"),
            "Days": _fmt_days(r.get("days")),
            "Time": _fmt_time(r.get("start_time")),
            "Location": _clean_text(r.get("location"), "TBA"),
            "Open Seats": int(open_seats) if pd.notna(open_seats) else "—",
            "Capacity": capacity if capacity is not None else "—",
            "CRN": r.get("crn") or "—",
        })

    if not records:
        return []
    sec_df = pd.DataFrame(records)
    cols = ["Instructor", "Days", "Time", "Location", "Open Seats", "Capacity", "CRN"]
    return [_ts("Fall 2026 Sections", sec_df, cols, len(records))]


def _section_summary(sections_df: "pd.DataFrame | None", subject: str, course_no: str) -> str:
    if sections_df is None or sections_df.empty:
        return "I don't have Fall 2026 section data for this course yet."
    rows = sections_df[
        (sections_df["subject"].str.upper() == subject.upper()) &
        (sections_df["course_number"].astype(str) == str(course_no))
    ]
    if rows.empty:
        return "I don't see Fall 2026 sections for this course in Darvis right now."

    open_count = 0
    instructors: list[str] = []
    for _, row in rows.iterrows():
        open_seats = row.get("open_seats")
        if pd.notna(open_seats):
            try:
                if int(open_seats) > 0:
                    open_count += 1
            except (TypeError, ValueError):
                pass
        instructor = _clean_text(row.get("instructor"))
        if instructor and instructor.upper() not in {"STAFF", "TBA"} and instructor not in instructors:
            instructors.append(instructor)

    section_word = "section" if len(rows) == 1 else "sections"
    open_word = "section has" if open_count == 1 else "sections have"
    if instructors:
        names = ", ".join(instructors[:3])
        if len(instructors) > 3:
            names += f", and {len(instructors) - 3} more"
        return f"Fall 2026 has {len(rows)} {section_word}; {open_count} {open_word} open seats. Scheduled instructors include {names}."
    return f"Fall 2026 has {len(rows)} {section_word}; {open_count} {open_word} open seats. Some instructor names are still listed as TBA."


def _section_counts(sections_df: "pd.DataFrame | None", subject: str, course_no: str) -> tuple[int | None, int | None]:
    if sections_df is None or sections_df.empty:
        return None, None
    rows = sections_df[
        (sections_df["subject"].str.upper() == subject.upper()) &
        (sections_df["course_number"].astype(str) == str(course_no))
    ]
    if rows.empty:
        return 0, 0
    open_count = 0
    for _, row in rows.iterrows():
        open_seats = row.get("open_seats")
        if pd.notna(open_seats):
            try:
                if int(open_seats) > 0:
                    open_count += 1
            except (TypeError, ValueError):
                pass
    return len(rows), open_count


def _course_overview_answer(
    result: pd.DataFrame,
    subject: str | None,
    course_no: str,
    description: str,
    title: str,
    sections_df: "pd.DataFrame | None",
) -> str:
    course_label = f"{subject} {course_no}".strip() if subject else course_no
    pieces: list[str] = []

    if description:
        pieces.append(f"{course_label}: {description}")
    elif title:
        pieces.append(f"{course_label} is {title}. Darvis doesn't have the full catalog description for this course yet.")
    else:
        pieces.append(f"Darvis doesn't have the full catalog description for {course_label} yet.")

    top = result.iloc[0]
    pieces.append(
        f"By historical grade outcomes, {top.get('Instructor', 'the top instructor')} is the strongest listed instructor: "
        f"{float(top.get('Avg GPA')):.2f} average GPA and {float(top.get('Avg A Range (%)')):.1f}% A/A- rate "
        f"across {int(top.get('Total Students', 0)):,} students."
    )
    pieces.append(_section_summary(sections_df, subject or "", course_no))
    pieces.append("Grade distributions do not fully measure teaching quality, workload, exam difficulty, or student experience.")
    return " ".join(pieces)


def _requested_courses_from_question(question: str, intent=None) -> list[tuple[str, str]]:
    raw_courses = getattr(intent, "requested_courses", None) if intent is not None else None
    courses: list[tuple[str, str]] = []

    for item in raw_courses or []:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            subj, num = item[0], item[1]
        elif isinstance(item, dict):
            subj, num = item.get("subject"), item.get("course_no") or item.get("no") or item.get("course_number")
        else:
            continue
        if subj and num:
            courses.append((str(subj).upper().strip(), str(num).strip()))

    for match in re.finditer(r"\b([A-Za-z]{2,5})\s*-?\s*(\d{4})\b(?![-\s]?level)", question):
        courses.append((match.group(1).upper(), match.group(2)))

    seen: set[tuple[str, str]] = set()
    deduped: list[tuple[str, str]] = []
    for course in courses:
        if course in seen:
            continue
        seen.add(course)
        deduped.append(course)
    return deduped


def _handle_course_comparison(
    question: str,
    courses: list[tuple[str, str]],
    df: pd.DataFrame,
    min_students: int,
    use_recency: bool,
    sections_df: "pd.DataFrame | None",
    indexes,
):
    records: list[dict] = []
    answer_bits: list[str] = []

    for subj, num in courses:
        label = f"{subj} {num}"
        result = course_profile(df, subj, num, min_students, use_recency)
        key = (subj.upper(), str(num).strip())
        title = ""
        description = ""
        if indexes is not None:
            title = indexes.course_titles.get(key, "") or ""
            description = indexes.course_descriptions.get(key, "") or ""
        section_count, open_section_count = _section_counts(sections_df, subj, num)

        record = {
            "Course": label,
            "Course Title": title or "Unknown",
            "Description": description or "No catalog description available in Darvis.",
            "Best Instructor": "No grade data",
            "Avg GPA": None,
            "Avg A Range (%)": None,
            "Total Students": None,
            "Fall 2026 Sections": section_count,
            "Open Sections": open_section_count,
        }

        if result.empty:
            answer_bits.append(f"{label} does not have enough grade-outcome data in Darvis with the current filters.")
        else:
            top = result.iloc[0]
            instructor = _clean_text(top.get("Instructor"), "the strongest listed instructor")
            avg_gpa = float(top.get("Avg GPA"))
            avg_a = float(top.get("Avg A Range (%)"))
            total_students = int(top.get("Total Students", 0))
            record.update({
                "Best Instructor": instructor,
                "Avg GPA": round(avg_gpa, 3),
                "Avg A Range (%)": round(avg_a, 2),
                "Total Students": total_students,
            })
            answer_bits.append(
                f"{label}: {instructor} leads by historical grade outcomes "
                f"({avg_gpa:.2f} average GPA, {avg_a:.1f}% A/A- rate, {total_students:,} students)."
            )
        records.append(record)

    comparison_df = pd.DataFrame(records)
    labels = ", ".join(f"{subj} {num}" for subj, num in courses)
    answer = (
        f"Here is a focused comparison for {labels}. "
        + " ".join(answer_bits)
        + " Grade distributions do not fully measure teaching quality, workload, exam difficulty, or student experience."
    )
    cols = [
        "Course", "Course Title", "Description", "Best Instructor", "Avg GPA",
        "Avg A Range (%)", "Total Students", "Fall 2026 Sections", "Open Sections",
    ]
    tables = [table_spec("Course Comparison", comparison_df, cols, len(records))]
    metadata = {"comparison_courses": courses, "route": "course_profile"}
    return answer, tables, [], metadata


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

    # Use LLM-extracted course parts if available; fall back to regex
    if intent is not None and intent.course_no:
        subject = intent.subject
        course_no = intent.course_no
    else:
        subject, course_no = extract_course_parts(question)

    if not course_no:
        return None

    requested_courses = _requested_courses_from_question(question, intent)
    if len(requested_courses) >= 2 and _is_course_comparison_question(question):
        return _handle_course_comparison(
            question,
            requested_courses,
            df,
            min_students,
            use_recency,
            sections_df,
            indexes,
        )

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
    title = ""
    if indexes is not None and subject and course_no:
        key = (subject.upper(), course_no.strip())
        description = indexes.course_descriptions.get(key, "") or ""
        title = indexes.course_titles.get(key, "") or ""

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
        if description:
            answer = (
                f"{subject} {course_no} — {description} "
                "Darvis doesn't have enough grade data for that course with the current filters."
            )
        else:
            answer = course_answer(question, result, subject, course_no, sort_ascending=sort_ascending)
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
    # Keep the natural-language summary deterministic when structured rows exist.
    # The LLM occasionally contradicted the table ("no grade data") even while the
    # response included a populated Professor Summary. The table is the source of
    # truth, so data-present course summaries should be rendered from it directly.
    if _is_about_course_question(question):
        answer = _course_overview_answer(result_display, subject, course_no, description, title, sections_df)
    else:
        answer = course_answer(question, result_display, subject, course_no, sort_ascending=sort_ascending)

    charts = [
        bar_chart(f"Average GPA by Professor for {subject or ''} {course_no}".strip(), result_display.sort_values("Avg GPA", ascending=True), "Avg GPA", "Instructor", "Recency-weighted when requested."),
        scatter_chart(f"A/A- Rate vs F Rate for {subject or ''} {course_no}".strip(), result_display, "Avg F Rate (%)", "Avg A Range (%)", "Bubble data includes students and confidence fields."),
        bar_chart(f"Sample Size by Professor for {subject or ''} {course_no}".strip(), result_display.sort_values("Total Students", ascending=True), "Total Students", "Instructor", "More students usually means more reliable grade-outcome data."),
    ]
    sec_tables = _build_sections_table(sections_df, subject, course_no)
    tables = [table_spec("Professor Summary", result_display, cols, settings.max_rows_to_llm)] + sec_tables
    return answer, tables, charts, {"subject": subject, "course_no": course_no}

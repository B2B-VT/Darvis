"""
app/features/section_lookup.py

Handles timetable queries:
  "who is teaching CS 1114 this semester?"
  "what times are available for CS 2506?"
  "what time does Cao teach CS 1114?"
  "of the professors teaching CS 3114 this semester, who has the best grades and RMP?"
"""

import re
import logging
import pandas as pd
from supabase import create_client
from app.config import get_settings

logger = logging.getLogger("darvis.section_lookup")

_DAY_MAP = {"M": "Mon", "T": "Tue", "W": "Wed", "R": "Thu", "F": "Fri"}


def _current_term() -> str:
    return get_settings().current_term


def _term_label() -> str:
    return get_settings().current_term_label


def _fmt_days(days: list) -> str:
    if not days:
        return "TBA"
    return "".join(_DAY_MAP.get(d, d) for d in days)


def _fmt_time(t: str) -> str:
    if not t:
        return "TBA"
    try:
        parts = t.split(":")
        h, m = int(parts[0]), int(parts[1])
        period = "AM" if h < 12 else "PM"
        return f"{h % 12 or 12}:{m:02d} {period}"
    except Exception:
        return t


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


def _last(name: str) -> str:
    """Extract last name from 'Last, First', 'First Last', or bare 'Last'."""
    n = (name or "").strip()
    if "," in n:
        return n.split(",")[0].strip().lower()
    parts = n.split()
    return parts[-1].lower() if parts else ""


_SEMESTER_YEAR_RE = re.compile(
    r"\b(spring|summer|fall|winter)\s+(\d{4})\b|\b(\d{4})\s+(spring|summer|fall|winter)\b",
    re.IGNORECASE,
)


def _mentions_different_term(question: str, term_label: str) -> bool:
    """
    "Show me Spring 2035 sections for CS 1114" names a term Darvis doesn't
    have — verified live that this was silently answered with CURRENT-term
    data with zero acknowledgement that the requested term differs, directly
    violating the system's own 'never present one term as another' rule.
    Only the current term (e.g. "Fall 2026") is ever loaded, so any other
    explicitly-named semester+year is, by definition, unavailable.
    """
    m = _SEMESTER_YEAR_RE.search(question)
    if not m:
        return False
    mentioned = " ".join(g for g in m.groups() if g).strip().lower()
    parts = mentioned.split()
    mentioned_norm = f"{parts[0]} {parts[1]}" if parts[0].isalpha() else f"{parts[1]} {parts[0]}"
    return mentioned_norm != term_label.lower()


def handle_section_lookup(question: str, df, llm, rmp_df=None, intent=None, sections_df=None, indexes=None):
    """Returns (answer, tables, charts, metadata)."""
    from app.utils.charts import table_spec

    settings    = get_settings()
    term_label  = settings.current_term_label
    subject     = (getattr(intent, "subject", None) or "CS").upper()
    course_no   = getattr(intent, "course_no", None)
    prof_filter = getattr(intent, "professor_name", None)

    course_label = f"{subject} {course_no}".strip() if course_no else subject

    if _mentions_different_term(question, term_label):
        return (
            f"Darvis only has {term_label} section data right now — I don't have that other term available. "
            f"Here's what I can tell you for {term_label} once you confirm, or check the official VT timetable for other terms.",
            [], [], {"term_mismatch": True}
        )

    if not course_no:
        if prof_filter and indexes is not None and getattr(indexes, "sections_by_instructor", None):
            return _professor_sections(prof_filter, indexes, table_spec)
        return (
            "I need a specific course to look up the schedule — which course are you asking about?",
            [], [], {}
        )

    # ── Use in-memory sections_df when available; fall back to live Supabase query ──
    if sections_df is not None and not sections_df.empty:
        filtered = sections_df[sections_df["subject"].str.upper() == subject]
        if course_no:
            filtered = filtered[filtered["course_number"].astype(str) == str(course_no)]
        rows = filtered.to_dict("records")
    else:
        try:
            client = create_client(settings.supabase_url, settings.supabase_key)
            q = (client.table("sections")
                 .select("crn,subject,course_number,instructor,days,start_time,end_time,location,seats,enrolled,open_seats")
                 .eq("term", settings.current_term)
                 .eq("subject", subject))
            if course_no:
                q = q.eq("course_number", str(course_no))
            rows = q.execute().data or []
        except Exception as e:
            logger.error("section_lookup DB error: %s", e)
            return (
                f"Couldn't retrieve {term_label} sections right now — try the Schedule page to browse directly.",
                [], [], {}
            )

    if not rows:
        return (
            f"No {term_label} sections found for {course_label}.",
            [], [], {}
        )

    # Optional professor filter
    if prof_filter:
        pf = prof_filter.lower()
        filtered = [r for r in rows
                    if pf in _clean_text(r.get("instructor"), "Staff").lower()
                    or pf in _last(_clean_text(r.get("instructor"), "Staff"))]
        if filtered:
            rows = filtered

    # Group sections by instructor
    instructor_map: dict[str, list] = {}
    for r in rows:
        inst = _clean_text(r.get("instructor"), "Staff")
        instructor_map.setdefault(inst, []).append(r)

    # ── Combined query: who's teaching + grades/RMP ───────────────────────────
    q_low = question.lower()
    is_combined = any(w in q_low for w in [
        "best", "grade", "gpa", "rmp", "rate my", "rating",
        "highest", "lowest", "easiest", "hardest", "outcomes",
    ])
    if is_combined and df is not None:
        return _combined(question, course_label, subject, course_no,
                         instructor_map, df, rmp_df, llm)

    # ── Simple: who's teaching / what times ───────────────────────────────────
    section_rows = []
    for inst, secs in instructor_map.items():
        for s in secs:
            section_rows.append({
                "Instructor": inst,
                "Days":       _fmt_days(s.get("days") or []),
                "Start":      _fmt_time(s.get("start_time")),
                "End":        _fmt_time(s.get("end_time")),
                "Location":   _clean_text(s.get("location"), "TBA"),
                "Open Seats": s.get("open_seats") if s.get("open_seats") is not None else "?",
                "Enrolled":   s.get("enrolled") or 0,
            })
    section_rows.sort(key=lambda r: (str(r["Instructor"]), str(r["Start"])))

    _sec_cols = ["Instructor", "Days", "Start", "End", "Location", "Open Seats", "Enrolled"]
    tbl = table_spec(
        f"{course_label} — {term_label} Sections",
        pd.DataFrame(section_rows)[_sec_cols],
        _sec_cols,
    )

    table_text = (
        f"{course_label} sections in {term_label}:\n"
        "Instructor | Days | Start | End | Location | Open Seats | Enrolled\n"
        + "\n".join(
            f"{r['Instructor']} | {r['Days']} | {r['Start']} | {r['End']} | "
            f"{r['Location']} | {r['Open Seats']} | {r['Enrolled']}"
            for r in section_rows
        )
    )

    is_who      = any(w in q_low for w in ["who", "which professor", "which prof", "teaching", "taught by"])
    is_time     = any(w in q_low for w in ["time", "when", "schedule", "days", "hours"])
    is_seats    = any(w in q_low for w in ["seat", "seats", "full", "open", "room", "space", "spot", "spots", "enrollment", "capacity", "available"])
    is_location = any(w in q_low for w in ["where", "building", "location", "held", "meets"])

    if prof_filter:
        framing = f"The student wants to know when {prof_filter} teaches {course_label} in {term_label}."
    elif is_seats:
        framing = (
            f"The student wants to know about seat availability for {course_label} in {term_label}. "
            f"For each section report the number of open seats and flag any with 0 open seats as full. Be specific with numbers."
        )
    elif is_location:
        framing = f"The student wants to know where {course_label} is held in {term_label}. List the building/room for each section."
    elif is_who:
        framing = f"The student wants to know who is teaching {course_label} in {term_label}. Name the instructors and their scheduled times."
    else:
        framing = f"The student wants to know what times {course_label} is offered in {term_label}."

    instructors = sorted({
        str(r["Instructor"]).strip()
        for r in section_rows
        if str(r.get("Instructor", "")).strip()
        and str(r.get("Instructor", "")).strip().lower() not in {"staff", "nan", "none"}
    })
    if is_seats:
        full = [r for r in section_rows if r["Open Seats"] == 0]
        open_rows = [r for r in section_rows if isinstance(r["Open Seats"], int) and r["Open Seats"] > 0]
        if open_rows:
            sample = "; ".join(f"{r['Instructor']} {r['Days']} {r['Start']} has {r['Open Seats']} open" for r in open_rows[:4])
            answer = f"{course_label} has open seats in {term_label}: {sample}."
        elif full:
            answer = f"All listed {course_label} sections in {term_label} are full."
        else:
            answer = f"{course_label} has {len(section_rows)} section(s) in {term_label}, but open-seat counts are unavailable."
    elif is_location:
        locs = "; ".join(f"{r['Instructor']} {r['Days']} {r['Start']} in {r['Location']}" for r in section_rows[:5])
        answer = f"{course_label} meets in {term_label} at these locations: {locs}."
    elif is_who or not is_time:
        answer = (
            f"{course_label} is taught by {', '.join(instructors)} in {term_label}."
            if instructors else
            f"{course_label} has {len(section_rows)} section(s) in {term_label} — check the Schedule page."
        )
    else:
        times = [f"{r['Days']} {r['Start']}–{r['End']}" for r in section_rows[:4]]
        answer = f"{course_label} is offered {', '.join(times)} in {term_label}."

    return answer, [tbl], [], {"section_count": len(rows)}


def _professor_sections(prof_filter: str, indexes, table_spec):
    """Return a professor's full Fall 2026 section list when no course was
    specified — e.g. "what is Hamouda teaching this semester?"."""
    last = _last(prof_filter)
    prof_sections = indexes.sections_by_instructor.get(last, [])
    if not prof_sections:
        return (
            f"I couldn't find any {_term_label()} sections taught by {prof_filter}.",
            [], [], {}
        )

    rows = []
    for s in prof_sections:
        rows.append({
            "Course":     f"{s.get('subject', '')} {s.get('course_number', '')}".strip(),
            "Days":       _fmt_days(s.get("days") or []),
            "Start":      _fmt_time(s.get("start_time")),
            "End":        _fmt_time(s.get("end_time")),
            "Location":   s.get("location") or "TBA",
            "Open Seats": s.get("open_seats") if s.get("open_seats") is not None else "?",
        })
    rows.sort(key=lambda r: (r["Course"], r["Start"]))

    _cols = ["Course", "Days", "Start", "End", "Location", "Open Seats"]
    tbl = table_spec(
        f"{prof_filter} — {_term_label()} Sections",
        pd.DataFrame(rows)[_cols],
        _cols,
    )

    courses = sorted({r["Course"] for r in rows})
    answer = f"{prof_filter} is teaching {', '.join(courses)} in {_term_label()}."
    return answer, [tbl], [], {"section_count": len(prof_sections)}


def _combined(question, course_label, subject, course_no, instructor_map, df, rmp_df, llm):
    """Cross-reference section instructors with grades DF + RMP."""
    from app.utils.charts import table_spec
    term_label = _term_label()

    # Filter grades DF to this specific course
    mask = pd.Series([True] * len(df), index=df.index)
    if course_no:
        mask &= df["Course No."].astype(str).str.strip() == str(course_no)
    if subject:
        mask &= df["Subject"].str.upper() == subject.upper()
    course_df = df[mask]

    rows_out = []
    for inst_name, secs in instructor_map.items():
        # Time summary (up to 2 sections)
        times = []
        for s in secs:
            days  = _fmt_days(s.get("days") or [])
            start = _fmt_time(s.get("start_time"))
            if days and start != "TBA":
                times.append(f"{days} {start}")
        time_str = ", ".join(times[:2]) if times else "TBA"

        # Grade stats — exact canonical name match (both sections and grades now canonical)
        inst_grades = pd.DataFrame()
        if not course_df.empty:
            inst_grades = course_df[
                course_df["Instructor"].str.lower() == inst_name.lower()
            ]

        if not inst_grades.empty:
            enroll   = inst_grades["Graded Enrollment"].fillna(0)
            total    = enroll.sum()
            gpa      = round((inst_grades["GPA"] * enroll).sum() / total, 2) if total else None
            a_rate   = round(inst_grades["A (%)"].mean(), 1) if "A (%)" in inst_grades.columns else None
            students = int(total)
        else:
            gpa, a_rate, students = None, None, 0

        # RMP — exact canonical name match (sections.instructor is now canonical)
        rmp_rating = None
        if rmp_df is not None and not rmp_df.empty:
            rmp_match = rmp_df[rmp_df["name"].str.lower() == inst_name.lower()]
            if not rmp_match.empty:
                rmp_rating = rmp_match.iloc[0].get("rmp_rating")

        rows_out.append({
            "Instructor": inst_name,
            "Times":      time_str,
            "GPA":        gpa,
            "A (%)":      a_rate,
            "A_str":      f"{a_rate:.1f}%" if a_rate is not None else "No data",
            "Students":   students,
            "RMP":        rmp_rating,
        })

    # Sort: instructors with grade data first, then descending GPA
    rows_out.sort(key=lambda r: (r["GPA"] is None, -(r["GPA"] or 0)))

    _comb_cols = ["Instructor", "Times", "Avg GPA", "A Rate", "Students", "RMP"]
    _comb_df = pd.DataFrame([{
        "Instructor": r["Instructor"],
        "Times":      r["Times"],
        "Avg GPA":    r["GPA"] if r["GPA"] is not None else "No data",
        "A Rate":     r["A_str"],
        "Students":   r["Students"] or "No data",
        "RMP":        r["RMP"] if r["RMP"] is not None else "No data",
    } for r in rows_out])
    tbl = table_spec(
        f"{course_label} — {term_label} Instructors: Grades & RMP",
        _comb_df,
        _comb_cols,
    )

    best = next((r for r in rows_out if r["GPA"] is not None), None)
    if best:
        rmp_part = f" and RMP {float(best['RMP']):.1f}/5" if best["RMP"] is not None and pd.notna(best["RMP"]) else ""
        answer = (
            f"Of the professors teaching {course_label} in {term_label}, "
            f"{best['Instructor']} has the strongest grade data with a {best['GPA']} GPA"
            f"{rmp_part}; scheduled times include {best['Times']}."
        )
    else:
        names = [r["Instructor"] for r in rows_out]
        answer = f"{course_label} in {term_label} is taught by {', '.join(names)}. Darvis has no matching grade data for those instructors."

    return answer, [tbl], [], {"section_count": sum(len(s) for s in instructor_map.values())}

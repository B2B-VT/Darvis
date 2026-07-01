"""
app/features/section_lookup.py

Handles timetable queries:
  "who is teaching CS 1114 this semester?"
  "what times are available for CS 2506?"
  "what time does Cao teach CS 1114?"
  "of the professors teaching CS 3114 this semester, who has the best grades and RMP?"
"""

import logging
import pandas as pd
from supabase import create_client
from app.config import get_settings

logger = logging.getLogger("darvis.section_lookup")

CURRENT_TERM = "202609"
TERM_LABEL   = "Fall 2026"

_DAY_MAP = {"M": "Mon", "T": "Tue", "W": "Wed", "R": "Thu", "F": "Fri"}


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


def _last(name: str) -> str:
    """Extract last name from 'Last, First', 'First Last', or bare 'Last'."""
    n = (name or "").strip()
    if "," in n:
        return n.split(",")[0].strip().lower()
    parts = n.split()
    return parts[-1].lower() if parts else ""


def handle_section_lookup(question: str, df, llm, rmp_df=None, intent=None):
    """Returns (answer, tables, charts, metadata)."""
    from app.utils.charts import table_spec

    settings    = get_settings()
    subject     = (getattr(intent, "subject", None) or "CS").upper()
    course_no   = getattr(intent, "course_no", None)
    prof_filter = getattr(intent, "professor_name", None)

    course_label = f"{subject} {course_no}".strip() if course_no else subject

    if not course_no:
        return (
            "I need a specific course to look up the schedule — which course are you asking about?",
            [], [], {}
        )

    # ── Live Supabase query ────────────────────────────────────────────────────
    try:
        client = create_client(settings.supabase_url, settings.supabase_key)
        q = (client.table("sections")
             .select("crn,subject,course_number,instructor,days,start_time,end_time,location,seats,enrolled")
             .eq("term", CURRENT_TERM)
             .eq("subject", subject))
        if course_no:
            q = q.eq("course_number", str(course_no))
        rows = q.execute().data or []
    except Exception as e:
        logger.error("section_lookup DB error: %s", e)
        return (
            f"Couldn't retrieve {TERM_LABEL} sections right now — try the Schedule page to browse directly.",
            [], [], {}
        )

    if not rows:
        return (
            f"No {TERM_LABEL} sections found for {course_label}.",
            [], [], {}
        )

    # Optional professor filter
    if prof_filter:
        pf = prof_filter.lower()
        filtered = [r for r in rows
                    if pf in (r.get("instructor") or "").lower()
                    or pf in _last(r.get("instructor") or "")]
        if filtered:
            rows = filtered

    # Group sections by instructor
    instructor_map: dict[str, list] = {}
    for r in rows:
        inst = r.get("instructor") or "Staff"
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
                "Location":   s.get("location") or "TBA",
                "Seats":      s.get("seats") if s.get("seats") is not None else "?",
                "Enrolled":   s.get("enrolled") or 0,
            })
    section_rows.sort(key=lambda r: (r["Instructor"], r["Start"]))

    _sec_cols = ["Instructor", "Days", "Start", "End", "Location", "Seats", "Enrolled"]
    tbl = table_spec(
        f"{course_label} — {TERM_LABEL} Sections",
        pd.DataFrame(section_rows)[_sec_cols],
        _sec_cols,
    )

    table_text = (
        f"{course_label} sections in {TERM_LABEL}:\n"
        "Instructor | Days | Start | End | Location | Seats | Enrolled\n"
        + "\n".join(
            f"{r['Instructor']} | {r['Days']} | {r['Start']} | {r['End']} | "
            f"{r['Location']} | {r['Seats']} | {r['Enrolled']}"
            for r in section_rows
        )
    )

    is_who      = any(w in q_low for w in ["who", "which professor", "which prof", "teaching", "taught by"])
    is_time     = any(w in q_low for w in ["time", "when", "schedule", "days", "hours"])
    is_seats    = any(w in q_low for w in ["seat", "seats", "full", "open", "room", "space", "spot", "spots", "enrollment", "capacity", "available"])
    is_location = any(w in q_low for w in ["where", "building", "location", "held", "meets"])

    if prof_filter:
        framing = f"The student wants to know when {prof_filter} teaches {course_label} in {TERM_LABEL}."
    elif is_seats:
        framing = (
            f"The student wants to know about seat availability for {course_label} in {TERM_LABEL}. "
            f"For each section report seats open (Seats minus Enrolled) and flag any that are full. Be specific with numbers."
        )
    elif is_location:
        framing = f"The student wants to know where {course_label} is held in {TERM_LABEL}. List the building/room for each section."
    elif is_who:
        framing = f"The student wants to know who is teaching {course_label} in {TERM_LABEL}. Name the instructors and their scheduled times."
    else:
        framing = f"The student wants to know what times {course_label} is offered in {TERM_LABEL}."

    prompt = (
        f"Section data:\n{table_text}\n\n"
        f"Student context: {framing} Answer directly in 2-3 sentences. No markdown.\n\n"
        f"Student's question: {question}"
    )

    answer = None
    if llm:
        try:
            answer = llm.generate(prompt)
        except Exception:
            pass

    if not answer:
        instructors = sorted({r["Instructor"] for r in section_rows if r["Instructor"] != "Staff"})
        if is_who or not is_time:
            answer = (
                f"{course_label} is taught by {', '.join(instructors)} in {TERM_LABEL}."
                if instructors else
                f"{course_label} has {len(section_rows)} section(s) in {TERM_LABEL} — check the Schedule page."
            )
        else:
            times = [f"{r['Days']} {r['Start']}–{r['End']}" for r in section_rows[:4]]
            answer = f"{course_label} is offered {', '.join(times)} in {TERM_LABEL}."

    return answer, [tbl], [], {"section_count": len(rows)}


def _combined(question, course_label, subject, course_no, instructor_map, df, rmp_df, llm):
    """Cross-reference section instructors with grades DF + RMP."""
    from app.utils.charts import table_spec

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

        # Grade stats — match by last name
        inst_last = _last(inst_name)
        inst_grades = pd.DataFrame()
        if not course_df.empty and inst_last:
            inst_grades = course_df[
                course_df["Instructor"].str.lower().str.contains(inst_last, na=False)
            ]

        if not inst_grades.empty:
            enroll   = inst_grades["Graded Enrollment"].fillna(0)
            total    = enroll.sum()
            gpa      = round((inst_grades["GPA"] * enroll).sum() / total, 2) if total else None
            a_rate   = round(inst_grades["A (%)"].mean(), 1) if "A (%)" in inst_grades.columns else None
            students = int(total)
        else:
            gpa, a_rate, students = None, None, 0

        # RMP — match last name against rmp_df.name
        rmp_rating = None
        if rmp_df is not None and not rmp_df.empty and inst_last:
            rmp_match = rmp_df[rmp_df["name"].str.lower().str.contains(inst_last, na=False)]
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
        f"{course_label} — {TERM_LABEL} Instructors: Grades & RMP",
        _comb_df,
        _comb_cols,
    )

    table_text = (
        f"{course_label} instructors teaching in {TERM_LABEL} with grade & RMP data:\n"
        "Instructor | Times | Avg GPA | A Rate | Students | RMP\n"
        + "\n".join(
            f"{r['Instructor']} | {r['Times']} | "
            f"{r['GPA'] or 'no data'} | {r['A_str'].lower()} | "
            f"{r['Students'] or 'no data'} | {r['RMP'] or 'no data'}"
            for r in rows_out
        )
    )

    framing = (
        f"The student wants to know which professor teaching {course_label} in {TERM_LABEL} "
        f"has the best combination of grade outcomes and RMP score. "
        f"Lead with the top pick and their key stats. Be direct — 2-3 sentences, no markdown."
    )

    prompt = (
        f"Section + grade + RMP data:\n{table_text}\n\n"
        f"Student context: {framing}\n\n"
        f"Student's question: {question}"
    )

    answer = None
    if llm:
        try:
            answer = llm.generate(prompt)
        except Exception:
            pass

    if not answer:
        best = next((r for r in rows_out if r["GPA"] is not None), None)
        if best:
            answer = (
                f"Of the professors teaching {course_label} in {TERM_LABEL}, "
                f"{best['Instructor']} has the strongest grade data with a {best['GPA']} GPA."
            )
        else:
            names = [r["Instructor"] for r in rows_out]
            answer = f"{course_label} in {TERM_LABEL} is taught by {', '.join(names)}. Grade comparison is in the table above."

    return answer, [tbl], [], {"section_count": sum(len(s) for s in instructor_map.values())}

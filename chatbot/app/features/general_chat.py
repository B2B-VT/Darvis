import re
import logging
import pandas as pd
from app.features.templated_answers import general_answer

logger = logging.getLogger("darvis")

_SCHEDULE_RMP_PATTERNS = [
    "rmp", "rate my professor", "rating", "score", "rated",
    "professors you", "instructors you", "teachers you",
    "professors in", "those professors", "each professor",
]

# Follow-up reference phrases — indicate the user is asking about a prior schedule
_SCHEDULE_FOLLOWUP_REFS = [
    "those classes", "those courses", "those sections", "each of those",
    "each class", "each course", "each one", "the classes", "the courses",
    "those", "them", "they",
]

_SCHEDULE_LOCATION_WORDS = [
    "building", "location", "where", "room", "held", "meet",
]

_SCHEDULE_SEATS_WORDS = [
    "seat", "seats", "capacity", "enrolled", "enrollment", "full", "open",
    "spots", "space", "how many",
]

def _last_name(name: str) -> str:
    parts = (name or "").strip().split()
    return parts[-1].lower() if parts else ""


def _try_schedule_rmp_answer(question: str, history: list | None, rmp_df=None) -> str | None:
    """
    If asking about RMP scores for the schedule just built, answer from the
    startup-loaded instructors DataFrame directly instead of letting the LLM
    claim the schedule was fabricated.
    """
    if not history:
        return None
    q = question.lower()
    if not any(pat in q for pat in _SCHEDULE_RMP_PATTERNS):
        return None

    # Find the last schedule-builder assistant message
    schedule_msg = None
    for msg in reversed(history):
        if msg.get("role") == "assistant":
            content = msg.get("content", "")
            if "Schedule tab" in content or "schedule tab" in content:
                schedule_msg = content
                break
    if not schedule_msg:
        return None

    # Extract instructor names from "(HH:MM AM/PM–HH:MM AM/PM, InstructorName)"
    instructor_names = re.findall(
        r"\d+:\d+\s*(?:AM|PM)[^,)]*,\s*([A-Z][A-Za-z\s\.]+?)\)",
        schedule_msg,
    )
    instructor_names = [n.strip() for n in instructor_names if n.strip()]
    if not instructor_names:
        return None

    if rmp_df is None or rmp_df.empty:
        return None

    try:
        # Startup-loaded instructors DataFrame — a live Supabase read here would
        # be capped at 1,000 of the 3,800+ instructors by PostgREST.
        rmp_by_last: dict[str, dict] = {}
        for _, row in rmp_df.iterrows():
            ln = _last_name(str(row.get("name") or ""))
            if ln and ln not in rmp_by_last:
                rmp_by_last[ln] = row

        parts: list[str] = []
        no_data: list[str] = []
        for name in instructor_names:
            row = rmp_by_last.get(_last_name(name))
            if row is not None and pd.notna(row.get("rmp_rating")):
                rating = float(row["rmp_rating"])
                count  = row.get("rmp_count") or 0
                diff   = row.get("rmp_difficulty")
                diff_str = f", difficulty {float(diff):.1f}" if pd.notna(diff) else ""
                parts.append(f"{name}: {rating:.1f}/5 ({count} reviews{diff_str})")
            else:
                no_data.append(name)

        if not parts and no_data:
            return (
                f"None of the selected professors ({', '.join(no_data)}) "
                "have RMP data in our database yet."
            )

        lines = ["Here are the RMP scores for the professors I selected:"] + [f"  {p}" for p in parts]
        if no_data:
            lines.append(f"No RMP data on file for: {', '.join(no_data)}.")
        return " ".join(lines)

    except Exception as e:
        logger.warning("[general_chat] schedule RMP lookup failed: %s", e)
        return None


def _parse_schedule_from_history(history: list | None) -> list[dict]:
    """
    Extract course info from the last schedule-builder assistant message in history.
    Returns a list of {"subject": "CS", "course_number": "3604", "instructor": "Dunlap"}.
    The schedule message format is: "CS 3604 (MWF, 2:30–3:45 PM, Dunlap), CS 4094 (TuTh, 3:30–4:45 PM), ..."
    """
    if not history:
        return []
    for msg in reversed(history):
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content", "")
        if "Schedule tab" not in content:
            continue
        # Match "CS 3604 (MWF, 2:30–3:45 PM[, Instructor])"
        matches = re.findall(r"\b([A-Z]{2,5})\s+(\d{4})\s*\(([^)]+)\)", content)
        courses = []
        for subj, num, info in matches:
            # New format is "days, time range[, instructor]" — instructor is
            # the optional third comma-separated segment (Staff-taught
            # sections omit it entirely).
            parts = [p.strip() for p in info.split(",")]
            instructor = parts[2] if len(parts) > 2 else None
            courses.append({"subject": subj, "course_number": num, "instructor": instructor})
        return courses
    return []


def _try_schedule_section_details_answer(
    question: str,
    history: list | None,
    sections_df=None,
) -> str | None:
    """
    Answer building/location and/or seats/capacity follow-up questions for a
    previously-built schedule.  Returns None if the question isn't a follow-up
    or if sections_df has no matching data.
    """
    if sections_df is None or sections_df.empty:
        return None
    q = question.lower()

    # Must reference a prior set of courses (not a standalone question)
    if not any(p in q for p in _SCHEDULE_FOLLOWUP_REFS):
        return None

    wants_location = any(p in q for p in _SCHEDULE_LOCATION_WORDS)
    wants_seats    = any(p in q for p in _SCHEDULE_SEATS_WORDS)
    if not (wants_location or wants_seats):
        return None

    courses = _parse_schedule_from_history(history)
    if not courses:
        return None

    lines: list[str] = []
    for course in courses:
        subj = course["subject"]
        num  = course["course_number"]
        inst = course.get("instructor")

        mask = (
            (sections_df["subject"].str.upper() == subj) &
            (sections_df["course_number"].astype(str) == str(num))
        )
        rows = sections_df[mask]

        # Narrow by instructor last name if available
        if inst and not rows.empty:
            last = inst.strip().split()[-1].lower()
            inst_rows = rows[
                rows["instructor"].fillna("").str.lower().str.contains(last, regex=False, na=False)
            ]
            if not inst_rows.empty:
                rows = inst_rows

        if rows.empty:
            lines.append(f"{subj} {num}: data not found")
            continue

        row   = rows.iloc[0]
        parts = [f"{subj} {num}"]

        if wants_location:
            try:
                loc = row["location"]
                parts.append(f"in {loc}" if (pd.notna(loc) and loc) else "location TBA")
            except (KeyError, Exception):
                parts.append("location not on file")

        if wants_seats:
            try:
                seats    = row["seats"]
                enrolled = row["enrolled"]
                if pd.notna(seats) and seats is not None:
                    seats_i    = int(seats)
                    enrolled_i = int(enrolled) if pd.notna(enrolled) else 0
                    open_seats_raw = row.get("open_seats")
                    if pd.notna(open_seats_raw) and open_seats_raw is not None:
                        open_seats = int(open_seats_raw)
                    else:
                        open_seats = max(seats_i - enrolled_i, 0)
                    status     = "FULL" if open_seats <= 0 else f"{open_seats} open"
                    parts.append(f"{enrolled_i}/{seats_i} seats ({status})")
                else:
                    parts.append("seat data unavailable")
            except (KeyError, Exception):
                parts.append("seat data not on file")

        lines.append(" — ".join(parts))

    if not lines:
        return None

    if wants_location and wants_seats:
        intro = "Here are the locations and enrollment for the courses I selected:"
    elif wants_location:
        intro = "Here are the building locations for the courses I selected:"
    else:
        intro = "Here's the enrollment and seat availability for the courses I selected:"

    return intro + "\n" + "\n".join(f"  • {ln}" for ln in lines)


def handle_general_chat(question: str, df: pd.DataFrame, llm, vector_store, intent=None, history=None, user_profile=None, rmp_df=None, sections_df=None):
    """
    Catch-all for general_rag route — RAG context + LLM answer, no analytics table.
    Schedule RMP follow-ups are answered directly from loaded data to prevent LLM hallucination.
    """
    # Intercept schedule follow-up questions before hitting the LLM
    schedule_answer = _try_schedule_rmp_answer(question, history, rmp_df=rmp_df)
    if schedule_answer:
        return schedule_answer, [], [], {}

    section_details = _try_schedule_section_details_answer(question, history, sections_df=sections_df)
    if section_details:
        return section_details, [], [], {}

    retrieved = vector_store.query(question, n_results=6)
    from app.rag.prompts import build_rag_only_prompt
    if retrieved:
        prompt = build_rag_only_prompt(question, retrieved, intent=intent)
    else:
        prompt = (
            "You are a VT academic advisor. Answer this student's question using general "
            "knowledge about Virginia Tech. Do NOT state specific GPA averages, grade "
            "distributions, pass rates, A rates, F rates, or enrollment numbers — you have "
            "no grade data for this question and must not invent statistics.\n\n"
            f"Student's question: {question}"
        )

    if user_profile:
        parts = []
        if user_profile.get("major"):
            parts.append(f"Major: {user_profile['major']}")
        if user_profile.get("minor"):
            parts.append(f"Minor: {user_profile['minor']}")
        if user_profile.get("interests"):
            parts.append(f"Interests: {', '.join(user_profile['interests'])}")
        if user_profile.get("coursesTaken"):
            parts.append(f"Courses taken: {', '.join(user_profile['coursesTaken'])}")
        if parts:
            prompt += f"\n\nStudent profile: {' | '.join(parts)}"

    answer = llm.answer(prompt, history=history) or general_answer(question)
    return answer, [], [], {}

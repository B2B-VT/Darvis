"""
Schedule Builder feature.

Parses time constraints from the user's question, reads their profile
(major, completed courses, interests), queries the Supabase sections table,
and returns a conflict-free set of sections as schedule_actions for the
frontend to add directly to the user's scheduler.
"""

import re
from collections import defaultdict
from supabase import create_client
from app.config import get_settings

# Fall 2026 term code — update each semester
CURRENT_TERM = "202609"
MAX_COURSES   = 5

# Maps major keywords → preferred VT subject codes (ordered by relevance)
_MAJOR_SUBJECTS: dict[str, list[str]] = {
    "computer science": ["CS", "ECE", "MATH", "STAT", "AOE", "ISE"],
    "software engineering": ["CS", "ECE", "MATH", "STAT"],
    "electrical engineering": ["ECE", "MATH", "PHYS", "CS", "AOE"],
    "computer engineering": ["ECE", "CS", "MATH", "PHYS"],
    "mechanical engineering": ["ME", "MATH", "PHYS", "MSE", "AOE"],
    "aerospace engineering": ["AOE", "MATH", "PHYS", "ME", "ECE"],
    "civil engineering": ["CEE", "MATH", "GEOS", "ESM"],
    "industrial engineering": ["ISE", "MATH", "STAT", "CS", "MGT"],
    "materials science": ["MSE", "CHEM", "PHYS", "ME"],
    "environmental engineering": ["CEE", "ESM", "GEOS", "CHEM"],
    "biological systems engineering": ["BSE", "BIOL", "CHEM", "MATH"],
    "data science": ["CS", "STAT", "MATH", "ISE", "ECE"],
    "entrepreneurship": ["MGT", "FIN", "MKTG", "BIT", "ACIS", "ECON"],
    "business": ["MGT", "FIN", "MKTG", "ACIS", "BIT", "ECON"],
    "finance": ["FIN", "ACIS", "MGT", "ECON", "MATH"],
    "marketing": ["MKTG", "MGT", "BIT", "COMM"],
    "accounting": ["ACIS", "FIN", "MGT"],
    "economics": ["ECON", "MATH", "STAT", "FIN"],
    "information technology": ["BIT", "CS", "ISE", "MGT"],
    "biology": ["BIOL", "CHEM", "BCHS", "PPWS", "STAT"],
    "biochemistry": ["BCHS", "CHEM", "BIOL", "MATH"],
    "chemistry": ["CHEM", "BCHS", "MATH", "PHYS"],
    "physics": ["PHYS", "MATH", "STAT", "ECE"],
    "mathematics": ["MATH", "STAT", "CS", "PHYS"],
    "statistics": ["STAT", "MATH", "CS", "ISE"],
    "architecture": ["ARCH", "BLD", "UAPP", "AOE"],
    "landscape architecture": ["LARC", "HORT", "UAPP"],
    "urban planning": ["UAPP", "ARCH", "LARC", "POLS"],
    "psychology": ["PSYC", "SOC", "HD", "STAT"],
    "sociology": ["SOC", "PSYC", "POLS", "HD"],
    "political science": ["POLS", "HIST", "SOC", "ECON"],
    "history": ["HIST", "POLS", "SOC", "ENGL"],
    "english": ["ENGL", "COMM", "HIST"],
    "communication": ["COMM", "ENGL", "MKTG"],
    "agricultural science": ["AHRM", "PPWS", "BIOL", "CHEM"],
    "animal science": ["APSC", "BIOL", "CHEM"],
    "human nutrition": ["HNFE", "BIOL", "CHEM"],
    "public health": ["HNFE", "BIOL", "STAT", "SOC"],
    "neuroscience": ["NSCI", "BIOL", "PSYC", "CHEM"],
    "philosophy": ["PHIL", "ENGL", "POLS"],
    "religious studies": ["REL", "HIST", "PHIL"],
    "music": ["MUS"],
    "theatre": ["THEA", "COMM"],
    "art": ["ART", "ARCH"],
    "cinema": ["CNST", "COMM"],
}


def _major_subject_set(major: str, minor: str = "") -> list[str]:
    """
    Returns an ordered list of preferred subject codes for the user's major (and minor).
    Checks for partial matches so "B.S. Computer Science" matches "computer science".
    """
    subjects: list[str] = []
    seen: set[str] = set()

    def _add(m: str) -> None:
        m = m.lower().strip()
        for key, codes in _MAJOR_SUBJECTS.items():
            if key in m or m in key:
                for c in codes:
                    if c not in seen:
                        subjects.append(c)
                        seen.add(c)

    _add(major)
    if minor:
        _add(minor)
    return subjects


# ── Time parsing ──────────────────────────────────────────────────────────────

def _pad_time(t: str) -> str:
    """Normalize a DB time string to zero-padded HH:MM for reliable string comparison."""
    if not t:
        return t
    t = t[:5]
    parts = t.split(":")
    if len(parts) == 2:
        return f"{int(parts[0]):02d}:{parts[1]}"
    return t


def _fmt_time_12h(t: str) -> str:
    """Convert 'HH:MM' or 'H:MM' to '12-hour AM/PM' for display."""
    if not t:
        return t
    try:
        parts = t[:5].split(":")
        h, m = int(parts[0]), int(parts[1])
        period = "AM" if h < 12 else "PM"
        h12 = h % 12 or 12
        return f"{h12}:{m:02d} {period}"
    except Exception:
        return t


def _to_24h(hour: str, minute: str | None, ampm: str) -> str:
    h = int(hour)
    m = int(minute) if minute else 0
    ampm = ampm.lower()
    if ampm == "pm" and h != 12:
        h += 12
    elif ampm == "am" and h == 12:
        h = 0
    return f"{h:02d}:{m:02d}"


def parse_time_constraints(question: str) -> tuple[str, str]:
    """
    Returns (earliest_start, latest_end) as "HH:MM" strings.
    Defaults to "07:00" / "22:00" if nothing is found.
    """
    q = question.lower()
    time_pat = r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)"

    # "10am to 5pm" / "10am-5pm" / "between 10am and 5pm"
    range_pat = time_pat + r"\s*(?:to|-|–|and)\s*" + time_pat
    m = re.search(range_pat, q)
    if m:
        start = _to_24h(m.group(1), m.group(2), m.group(3))
        end   = _to_24h(m.group(4), m.group(5), m.group(6))
        return start, end

    # "no classes before 10am" / "nothing before 10"
    before = re.search(r"(?:before|earlier than|no earlier)\s*" + time_pat, q)
    # "no classes after 5pm" / "nothing after 5"
    after  = re.search(r"(?:after|later than|no later)\s*" + time_pat, q)

    start = _to_24h(*before.groups()) if before else "07:00"
    end   = _to_24h(*after.groups()) if after else "22:00"

    # "after noon" / "after 12" without am/pm
    if re.search(r"\bafter\s+noon\b", q) or re.search(r"\bafter\s+12\b", q):
        start = max(start, "12:00")
    if re.search(r"\bbefore\s+noon\b", q):
        end = min(end, "12:00")

    return start, end


# ── Course parsing ─────────────────────────────────────────────────────────────

def parse_requested_courses(question: str) -> list[tuple[str, str]]:
    """
    Extracts explicit course codes from the question, e.g. "CS 3114" → [("CS","3114")].
    Returns empty list if no courses are mentioned — means the bot should pick.
    """
    matches = re.findall(r"\b([A-Za-z]{2,5})\s*(\d{4})\b", question)
    blocklist = {
        "which","what","when","where","who","why","how","the","for",
        "with","from","have","has","are","and","but","not","this","that",
    }
    return [(s.upper(), n) for s, n in matches if s.lower() not in blocklist]


# Known VT subject codes for question-level subject extraction
_VT_SUBJECT_CODES = {
    "CS", "ECE", "MATH", "STAT", "PHYS", "CHEM", "BIOL", "ENGL", "HIST",
    "POLS", "PSYC", "SOC", "ECON", "FIN", "MGT", "MKTG", "ACIS", "BIT",
    "ME", "AOE", "CEE", "MSE", "ISE", "BME", "CHE", "BSE", "ESM", "GEOS",
    "ARCH", "BLD", "LARC", "UAPP", "ART", "THEA", "MUS", "COMM",
    "PHIL", "REL", "CNST", "SPAN", "FREC", "SPIA", "PAPA",
}

# Words that look like subject codes but are common English — never treat as a subject
_SUBJECT_BLOCKLIST = {
    "WITH", "JUST", "ONLY", "FROM", "THAT", "THIS", "HAVE", "MAKE",
    "NEED", "WANT", "LIKE", "SOME", "ALSO", "INTO", "OVER", "PLAN",
    "TIME", "BEST", "MORE", "LESS", "KEEP", "TAKE", "GIVE", "SHOW",
}


def parse_subject_filter(question: str) -> str | None:
    """
    Detect when the user explicitly asks to restrict the schedule to a single
    subject, e.g. "just CS courses", "only ECE classes", "with math courses".

    Returns the uppercase subject code (e.g. "CS") or None if no restriction.
    Only fires when the subject is immediately followed by "courses", "classes",
    "sections", or preceded by "just"/"only"/"all" — prevents false positives
    on phrases like "build me a schedule".
    """
    q_upper = question.upper()

    # Pattern: "just/only/all <SUBJECT> courses/classes/sections"
    m = re.search(
        r"\b(?:JUST|ONLY|ALL|WITH)\s+([A-Z]{2,5})\s+(?:COURSES?|CLASSES?|SECTIONS?)\b",
        q_upper,
    )
    if m:
        code = m.group(1)
        if code in _VT_SUBJECT_CODES and code not in _SUBJECT_BLOCKLIST:
            return code

    # Pattern: "<SUBJECT> courses/classes only" — e.g. "cs courses only"
    m = re.search(
        r"\b([A-Z]{2,5})\s+(?:COURSES?|CLASSES?|SECTIONS?)\b",
        q_upper,
    )
    if m:
        code = m.group(1)
        if code in _VT_SUBJECT_CODES and code not in _SUBJECT_BLOCKLIST:
            return code

    return None


def _last(name: str) -> str:
    """Extract lowercase last name from 'Last, First', 'First Last', or bare 'Last'."""
    n = (name or "").strip()
    if "," in n:
        return n.split(",")[0].strip().lower()
    parts = n.split()
    return parts[-1].lower() if parts else ""


# ── Conflict detection ─────────────────────────────────────────────────────────

def _conflicts(a: dict, b: dict) -> bool:
    days_a = set(a.get("days") or [])
    days_b = set(b.get("days") or [])
    if not days_a & days_b:
        return False
    return (a.get("start_time", "") < b.get("end_time", "") and
            b.get("start_time", "") < a.get("end_time", ""))


def _is_virtual(sec: dict) -> bool:
    loc   = (sec.get("location") or "").upper()
    start = (sec.get("start_time") or "").upper()
    return loc in ("ONLINE", "ARR") or "ARR" in start or "-----" in start


# ── Main handler ──────────────────────────────────────────────────────────────

def handle_schedule_builder(
    question: str,
    user_profile: dict | None = None,
    intent=None,
    df=None,
) -> tuple[str, list, list, dict]:
    settings = get_settings()
    client   = create_client(settings.supabase_url, settings.supabase_key)

    # Use LLM-extracted values when available, fall back to regex
    if intent is not None and (intent.time_start or intent.time_end):
        start_limit = intent.time_start or "07:00"
        end_limit   = intent.time_end   or "22:00"
    else:
        start_limit, end_limit = parse_time_constraints(question)

    if intent is not None and intent.requested_courses:
        requested_courses = intent.requested_courses
    else:
        requested_courses = parse_requested_courses(question)

    # Subject restriction: use LLM-extracted subject_filter, then regex, then None
    if intent is not None and intent.subject_filter:
        question_subject_filter = intent.subject_filter
    else:
        question_subject_filter = parse_subject_filter(question)

    # Profile data
    profile         = user_profile or {}
    major           = profile.get("major", "")
    minor           = profile.get("minor", "")
    interests       = [i.lower() for i in (profile.get("interests") or [])]
    courses_taken   = {
        re.sub(r"\s+", "", c).lower()
        for c in (profile.get("coursesTaken") or [])
    }
    preferred_subjects = _major_subject_set(major, minor)
    # Build a priority rank: lower index = higher priority
    subject_rank = {subj: idx for idx, subj in enumerate(preferred_subjects)}

    # ── Fetch required courses for the user's major from catalog data ──────────
    required_course_codes: set[str] = set()
    if major:
        try:
            # Find the matching major row (fuzzy match on major_name)
            major_lower = major.lower().strip()
            major_rows = client.table("majors").select("id, major_name").execute().data or []
            best_major_id = None
            best_score = 0
            for row in major_rows:
                name = (row.get("major_name") or "").lower()
                # Score: exact match > contains > partial overlap
                if name == major_lower:
                    best_major_id = row["id"]
                    break
                words_in_common = len(set(name.split()) & set(major_lower.split()))
                if words_in_common > best_score:
                    best_score = words_in_common
                    best_major_id = row["id"]
            if best_major_id:
                req_rows = client.table("major_requirements").select(
                    "course_code"
                ).eq("major_id", best_major_id).eq("requirement_type", "required").execute().data or []
                required_course_codes = {
                    re.sub(r"\s+", "", (r["course_code"] or "")).lower()
                    for r in req_rows if r.get("course_code")
                }
        except Exception:
            pass  # Catalog table may not be populated yet; fall back gracefully

    # ── Fetch sections for the current term ───────────────────────────────────
    # Push subject filter to DB to stay well under Supabase's 1000-row default.
    q = client.table("sections").select(
        "crn, subject, course_number, instructor, days, start_time, end_time, "
        "location, seats, enrolled, credits"
    ).eq("term", CURRENT_TERM)
    if question_subject_filter:
        q = q.eq("subject", question_subject_filter)
    elif requested_courses:
        subjects = list({s for s, _ in requested_courses})
        if len(subjects) == 1:
            q = q.eq("subject", subjects[0])
    res = q.limit(10000).execute()

    all_sections = res.data or []

    # ── Filter ─────────────────────────────────────────────────────────────────
    filtered = []
    for sec in all_sections:
        if _is_virtual(sec):
            continue

        st = sec.get("start_time") or ""
        et = sec.get("end_time")   or ""
        if not st or not et:
            continue

        # Time window — normalize before comparing so "9:00" and "09:00" are equivalent
        if _pad_time(st) < start_limit or _pad_time(et) > end_limit:
            continue

        # Skip completed courses
        course_key = re.sub(r"\s+", "", f"{sec['subject']}{sec['course_number']}").lower()
        if course_key in courses_taken:
            continue

        # If specific courses were requested, filter to only those
        if requested_courses:
            if not any(
                sec["subject"].upper() == s and sec["course_number"] == n
                for s, n in requested_courses
            ):
                continue

        # If the user asked for a specific subject ("just CS courses"), enforce it
        if question_subject_filter:
            if sec["subject"].upper() != question_subject_filter:
                continue

        # Must have open seats (or unknown seat count)
        seats    = sec.get("seats")    or 0
        enrolled = sec.get("enrolled") or 0
        if seats > 0 and enrolled >= seats:
            continue

        filtered.append(sec)

    if not filtered:
        time_str = f"{_fmt_time_12h(start_limit)}–{_fmt_time_12h(end_limit)}"
        subj_str = f" {question_subject_filter}" if question_subject_filter else ""
        if requested_courses:
            course_str = ", ".join(f"{s} {n}" for s, n in requested_courses)
            return (
                f"I couldn't find open in-person sections for {course_str} in Fall 2026 "
                f"within {time_str}. The sections table may not be fully populated yet — "
                "try the Schedule page to browse and add sections manually."
            ), [], [], {}
        return (
            f"I couldn't find any open{subj_str} sections between {time_str} for Fall 2026. "
            "Try the Schedule page to browse and add sections manually."
        ), [], [], {}

    # ── Build instructor GPA map from grades df ────────────────────────────────
    # Used when the user asks for "easiest" professors.
    sort_goal = getattr(intent, "sort_goal", "highest_gpa") if intent else "highest_gpa"
    q_low = question.lower()
    wants_easy = sort_goal == "highest_gpa" or any(
        w in q_low for w in ["easiest", "easy", "best grades", "highest gpa"]
    )
    wants_hard = sort_goal == "lowest_gpa" or any(
        w in q_low for w in ["hardest", "tough", "brutal", "lowest gpa"]
    )

    inst_gpa: dict[str, float] = {}
    if df is not None and (wants_easy or wants_hard):
        try:
            import pandas as pd
            gpa_df = df.copy()
            if question_subject_filter:
                gpa_df = gpa_df[gpa_df["Subject"].str.upper() == question_subject_filter]
            gpa_df = gpa_df.dropna(subset=["GPA", "Graded Enrollment"])
            for _, row in gpa_df.iterrows():
                last = _last(str(row["Instructor"]))
                if not last:
                    continue
                enroll = float(row["Graded Enrollment"] or 0)
                gpa    = float(row["GPA"] or 0)
                if last not in inst_gpa:
                    inst_gpa[last] = gpa * enroll
                    inst_gpa[last + "_n"] = enroll  # type: ignore[assignment]
                else:
                    inst_gpa[last] += gpa * enroll
                    inst_gpa[last + "_n"] += enroll  # type: ignore[assignment]
            # Finalize weighted averages
            for last in [k for k in inst_gpa if not k.endswith("_n")]:
                n = inst_gpa.get(last + "_n", 0)
                inst_gpa[last] = round(inst_gpa[last] / n, 3) if n else 0.0
            # Remove the _n accumulator keys
            inst_gpa = {k: v for k, v in inst_gpa.items() if not k.endswith("_n")}
        except Exception:
            inst_gpa = {}

    def _inst_gpa(s: dict) -> float:
        last = _last(s.get("instructor") or "")
        return inst_gpa.get(last, 0.0)

    # ── Group by course, pick best section per course ──────────────────────────
    by_course: dict[str, list] = defaultdict(list)
    for sec in filtered:
        by_course[f"{sec['subject']} {sec['course_number']}"].append(sec)

    # Score each section: instructor GPA (if known) then open seats
    def _score(s: dict) -> tuple:
        gpa = _inst_gpa(s)
        seats_open = (s.get("seats") or 0) - (s.get("enrolled") or 0)
        if wants_hard:
            return (gpa, seats_open)         # lower GPA first → use min
        return (-gpa if gpa else 1.0, -seats_open)  # higher GPA first

    candidates = [
        (min if wants_hard else max)(secs, key=_score)
        for secs in by_course.values()
    ]

    def _relevance_score(s: dict) -> tuple:
        subj  = s["subject"].upper()
        title = s.get("course_title", "").lower()
        course_key = re.sub(r"\s+", "", f"{s['subject']}{s['course_number']}").lower()

        # Tier 0: explicitly required by the major's catalog (highest priority)
        is_required = int(course_key in required_course_codes)

        # Tier 1: major subject rank (lower idx = more relevant)
        major_rank = subject_rank.get(subj, len(preferred_subjects))

        # Tier 2: interest keyword match
        interest_match = int(any(i in subj.lower() or i in title for i in interests))

        # Tier 3: instructor GPA (easiest → highest GPA first)
        gpa = _inst_gpa(s)
        gpa_rank = -(gpa) if (wants_easy and gpa) else (gpa if wants_hard else 0.0)

        # Tier 4: open seats
        seats_open = (s.get("seats") or 0) - (s.get("enrolled") or 0)

        return (-is_required, major_rank, -interest_match, gpa_rank, -seats_open)

    candidates.sort(key=_relevance_score)

    # ── Greedy conflict-free schedule ──────────────────────────────────────────
    schedule: list[dict] = []
    for cand in candidates:
        if not any(_conflicts(cand, s) for s in schedule):
            schedule.append(cand)
        if len(schedule) >= MAX_COURSES:
            break

    if not schedule:
        return (
            "I found courses in that time range but couldn't build a conflict-free schedule. "
            "Try the Browse Courses page to add sections manually."
        ), [], [], {}

    # ── Build schedule_actions (shape the frontend's addSection expects) ───────
    schedule_actions = [
        {
            "crn":          s["crn"],
            "subject":      s["subject"],
            "courseNumber": s["course_number"],
            "instructor":   s.get("instructor") or "Staff",
            "days":         s.get("days") or [],
            "startTime":    s.get("start_time") or "",
            "endTime":      s.get("end_time") or "",
            "location":     s.get("location") or "TBA",
            "seats":        s.get("seats") or 0,
            "enrolled":     s.get("enrolled") or 0,
            "credits":      float(s.get("credits") or 0),
            "term":         CURRENT_TERM,
        }
        for s in schedule
    ]

    total_credits = sum(s["credits"] for s in schedule_actions)
    course_list   = ", ".join(
        f"{s['subject']} {s['courseNumber']} "
        f"({_fmt_time_12h(s['startTime'])}–{_fmt_time_12h(s['endTime'])})"
        for s in schedule_actions
    )

    window = f"{_fmt_time_12h(start_limit)}–{_fmt_time_12h(end_limit)}"

    if question_subject_filter:
        context_line = f" Here's a {question_subject_filter}-only schedule"
    elif major:
        context_line = f" Based on your profile ({major}), I've built a schedule"
    else:
        context_line = " I've built a schedule"

    easy_note = " with the highest-GPA instructors available" if wants_easy else (
        " with the toughest instructors" if wants_hard else ""
    )

    answer = (
        f"{context_line}{easy_note} with {len(schedule)} courses "
        f"({total_credits:.0f} credits total) that fits entirely within "
        f"{window} with no conflicts: {course_list}. "
        "I've added them to your Schedule tab — you can swap any section out from there."
    ).strip()

    return answer, [], [], {"schedule_actions": schedule_actions}

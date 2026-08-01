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

MAX_COURSES = 8

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


def _time_to_minutes(t: str | None) -> int:
    """'HH:MM' -> minutes since midnight. Missing/unparseable defaults to noon."""
    try:
        h, m = (int(x) for x in (t or "12:00")[:5].split(":"))
        return h * 60 + m
    except (ValueError, TypeError):
        return 12 * 60


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


_DAY_ABBR = {"M": "M", "T": "Tu", "W": "W", "R": "Th", "F": "F", "S": "Sa", "U": "Su"}


def _fmt_days_compact(days: list) -> str:
    """["M","W","F"] -> "MWF"; ["T","R"] -> "TuTh"; ["M","W"] -> "MW"."""
    if not days:
        return "TBA"
    return "".join(_DAY_ABBR.get(d, d) for d in days)


def _fmt_time_range_12h(start: str, end: str) -> str:
    """'14:30','15:45' -> '2:30–3:45 PM' — one trailing AM/PM unless start/end cross it."""
    s, e = _fmt_time_12h(start), _fmt_time_12h(end)
    if not s or not e:
        return f"{s or '?'}–{e or '?'}"
    s_num, _, s_period = s.rpartition(" ")
    e_num, _, e_period = e.rpartition(" ")
    if s_period == e_period:
        return f"{s_num}–{e_num} {e_period}"
    return f"{s}–{e}"


def _last_name_only(name: str) -> str:
    parts = (name or "").strip().split()
    return parts[-1] if parts else (name or "")


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

    # Negation changes what "before"/"after" constrain:
    #   "no classes after 5pm"    → classes must END by 5pm   (end limit)
    #   "all classes after 1pm"   → classes must START at 1pm (start limit)
    #   "no classes before 10am"  → classes start at 10am     (start limit)
    #   "classes before noon"     → classes end by noon       (end limit)
    neg = r"(?:no|nothing|not|avoid|without|don'?t)"
    opt_of = r"(?:\s+(?:the\s+)?times?\s+of)?"
    neg_after  = re.search(neg + r"\b[^.?!]{0,40}?\bafter" + opt_of + r"\s*" + time_pat, q)
    neg_before = re.search(neg + r"\b[^.?!]{0,40}?\bbefore" + opt_of + r"\s*" + time_pat, q)
    after  = re.search(r"(?:after|later than)" + opt_of + r"\s*" + time_pat, q)
    before = re.search(r"(?:before|earlier than)" + opt_of + r"\s*" + time_pat, q)

    start, end = "07:00", "22:00"
    if neg_after:
        end = _to_24h(*neg_after.groups())
    elif after:
        start = _to_24h(*after.groups())
    if neg_before:
        start = _to_24h(*neg_before.groups())
    elif before and not neg_after:
        end = _to_24h(*before.groups())

    # "after noon" / "after 12" without am/pm
    if re.search(r"\bafter\s+noon\b", q) or re.search(r"\bafter\s+12\b", q):
        start = max(start, "12:00")
    if re.search(r"\bbefore\s+noon\b", q):
        end = min(end, "12:00")

    # "no 8ams" / "avoid 8ams" — earliest start 09:00
    if re.search(r"\b(?:no|avoid|without|skip)\s+(?:any\s+)?8\s*ams?\b", q):
        start = max(start, "09:00")
    # "morning classes only" / "only morning classes" — done by noon
    if re.search(r"\b(?:only\s+morning|morning\s+classes\s+only|mornings\s+only)\b", q):
        end = min(end, "12:00")

    return start, end


_STATED_SECTION_RE = re.compile(
    r"\b([A-Za-z]{2,5})\s*(\d{4})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+([MTWRFSUmtwrfsu]{1,5})\b"
)
_DEFAULT_CLASS_MINUTES = 50  # VT's standard MWF class length; used when the
                             # question states a start time but no end time.


def parse_stated_sections(question: str) -> list[dict]:
    """
    "CS 1114 at 9:30 MWF and MATH 1225 at 9:00 MWF" states EXACT sections to
    validate for conflicts — a fundamentally different request than "build me
    a schedule". Verified live: without this check, handle_schedule_builder
    silently ignored the user's stated times/days entirely and substituted
    its own different section picks, never answering the conflict question
    that was actually asked. AM/PM defaults to AM when omitted (typical for
    daytime class-time phrasing with no marker); end time is estimated using
    the standard 50-minute class length since the question gives no duration.
    """
    results = []
    for m in _STATED_SECTION_RE.finditer(question):
        subj, num, hour, minute, ampm, days = m.groups()
        start = _to_24h(hour, minute, ampm or "am")
        h, mi = (int(x) for x in start.split(":"))
        total = h * 60 + mi + _DEFAULT_CLASS_MINUTES
        end = f"{(total // 60) % 24:02d}:{total % 60:02d}"
        results.append({
            "subject": subj.upper(),
            "course_number": num,
            "start_time": start,
            "end_time": end,
            "days": [d.upper() for d in days],
        })
    return results


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


_CATEGORY_SUBJECTS = {
    "coding": ["CS"], "programming": ["CS"], "computer science": ["CS"],
    "math": ["MATH", "STAT"], "mathematics": ["MATH", "STAT"],
    "writing": ["ENGL", "COMM"], "english": ["ENGL"],
    "science": ["BIOL", "CHEM", "PHYS", "GEOS"],
}


def parse_category_requirements(question: str) -> dict[str, list[str]]:
    """
    "one coding class, one math class, one writing class" names topic
    categories, not exact courses — distinct from parse_requested_courses
    (exact codes) and parse_subject_filter (restrict-to-one-subject). Returns
    {category_name: [subject_codes]} for every category word mentioned.
    """
    q = question.lower()
    return {name: subjects for name, subjects in _CATEGORY_SUBJECTS.items() if re.search(rf"\b{re.escape(name)}\b", q)}


_DAY_NAMES = {
    "monday": "M", "tuesday": "T", "wednesday": "W",
    "thursday": "R", "friday": "F", "saturday": "S", "sunday": "U",
}


_DAY_ABBREVIATIONS = {
    "mon": "M", "monday": "M",
    "tue": "T", "tues": "T", "tuesday": "T",
    "wed": "W", "weds": "W", "wednesday": "W",
    "thu": "R", "thur": "R", "thurs": "R", "thursday": "R",
    "fri": "F", "friday": "F",
    "sat": "S", "saturday": "S",
    "sun": "U", "sunday": "U",
}
_ALL_DAY_CODES = {"M", "T", "W", "R", "F", "S", "U"}


def _parse_only_days(question: str) -> set[str] | None:
    """
    "I want X, Y, Z on Tue/Thu only" (or "only on Tue/Thu", "MWF only") names
    an INCLUSIVE day set — every other day is implicitly excluded. Handles
    abbreviated ("tue", "thu") and compact multi-letter ("mwf", "tth") forms.
    Returns the set of day codes to exclude (complement of the named days),
    or None if no "only" constraint is present.
    """
    q = question.lower()
    day_word = r"(?:" + "|".join(sorted(_DAY_ABBREVIATIONS, key=len, reverse=True)) + r")"
    # Separator between day names: punctuation ("/", ",", "&", optionally
    # followed by "and") OR bare "and" ("Monday and Wednesday" has no comma).
    day_sep = r"(?:\s*[/,&]\s*(?:and\s+)?|\s+and\s+)"
    day_list_pattern = rf"{day_word}(?:{day_sep}{day_word})*"

    m = re.search(rf"\bon\s+({day_list_pattern})\s+only\b", q)
    if not m:
        m = re.search(rf"\bonly\s+on\s+({day_list_pattern})\b", q)
    if not m:
        m = re.search(rf"\b({day_list_pattern})\s+only\b", q)
    if m:
        named = set()
        for tok in re.findall(day_word, m.group(1)):
            named.add(_DAY_ABBREVIATIONS[tok])
        if named:
            return _ALL_DAY_CODES - named

    # Compact form: "MWF only", "TTh only" — a single token of concatenated
    # single-letter day codes (M/T/W/R/F/S/U; "Th" normalizes to R).
    compact = re.search(r"\b([mtwrfsu]{2,7})\s+only\b", q.replace("th", "r"))
    if compact:
        named = {c.upper() for c in compact.group(1) if c.upper() in _ALL_DAY_CODES}
        if named:
            return _ALL_DAY_CODES - named

    return None


def parse_excluded_days(question: str) -> set[str]:
    only_days = _parse_only_days(question)
    if only_days is not None:
        return only_days

    q = question.lower()
    excluded: set[str] = set()
    for name, code in _DAY_NAMES.items():
        # handles: "no friday", "without any classes on friday",
        # "friday-free", "avoid friday", "not on friday"
        if re.search(
            rf"no\s+{name}"
            rf"|without\b.{{0,60}}{name}"
            rf"|{name}[\s-]free"
            rf"|avoid\s+{name}"
            rf"|skip\s+{name}"
            rf"|not\s+on\s+{name}",
            q,
        ):
            excluded.add(code)
    return excluded


def parse_min_gpa(question: str) -> float | None:
    q = question.lower()
    m = re.search(
        r"gpa\s+(?:of\s+)?(?:not\s+lower\s+than|above|at\s+least|minimum|no\s+lower\s+than|higher\s+than|over)\s+(\d+\.?\d*)|"
        r"(?:not\s+)?lower\s+than\s+(\d+\.?\d*)\s+gpa|"
        r"(?:minimum|min)\s+(\d+\.?\d*)\s+gpa|"
        r"gpa\s+(?:above|over|of)\s+(\d+\.?\d*)|"
        r"gpa\s+(?:of\s+)?lower\s+than\s+(\d+\.?\d*)|"
        r"without\b.{0,40}gpa\b.{0,20}lower\s+than\s+(\d+\.?\d*)",
        q,
    )
    if m:
        val = next(v for v in m.groups() if v is not None)
        return float(val)
    return None


def parse_min_rmp(question: str) -> float | None:
    q = question.lower()
    m = re.search(
        r"(?:rmp|rate\s+my\s+professor|rating)\s+(?:scores?\s+)?(?:of\s+)?(\d+\.?\d*)\s+(?:or\s+)?(?:higher|above|plus|\+)|"
        r"(?:rmp|rate\s+my\s+professor)\s+(?:of\s+)?(?:at\s+least|minimum|above|over)\s+(\d+\.?\d*)",
        q,
    )
    if m:
        val = next(v for v in m.groups() if v is not None)
        return float(val)
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
    history: list | None = None,
    sections_df=None,
    rmp_df=None,
    indexes=None,
) -> tuple[str, list, list, dict]:
    settings = get_settings()
    client   = create_client(settings.supabase_url, settings.supabase_key)

    # "Can I take X at 9:30 MWF and Y at 9:00 MWF?" asks whether two SPECIFIC,
    # user-stated sections conflict — not a request to build a fresh schedule.
    # Handle this separately before any of the normal building logic below.
    stated = parse_stated_sections(question)
    if len(stated) >= 2:
        conflicts = [
            (a, b) for i, a in enumerate(stated) for b in stated[i + 1:] if _conflicts(a, b)
        ]
        labels = ", ".join(f"{s['subject']} {s['course_number']} ({','.join(s['days'])} {s['start_time']})" for s in stated)
        if conflicts:
            pair = conflicts[0]
            answer = (
                f"No — {pair[0]['subject']} {pair[0]['course_number']} and {pair[1]['subject']} {pair[1]['course_number']} "
                f"overlap on {'/'.join(sorted(set(pair[0]['days']) & set(pair[1]['days'])))}, based on the times you gave "
                f"({labels}) and a standard {_DEFAULT_CLASS_MINUTES}-minute class length. "
                "Double-check the exact section times on the Schedule page — I'm estimating end times since you only gave start times."
            )
        else:
            answer = (
                f"Yes — based on the times you gave ({labels}) and a standard {_DEFAULT_CLASS_MINUTES}-minute class length, "
                "these don't overlap. Double-check the exact section end times on the Schedule page since I'm estimating them."
            )
        return answer, [], [], {"stated_section_check": True}

    # Use LLM-extracted values when available, fall back to regex
    if intent is not None and (intent.time_start or intent.time_end):
        start_limit = intent.time_start or "07:00"
        end_limit   = intent.time_end   or "22:00"
    else:
        start_limit, end_limit = parse_time_constraints(question)

    # Union the LLM's extraction with the regex fallback rather than an
    # either/or choice — verified live that for concatenated/typo'd phrasing
    # ("chem1035 n engl1106"), the LLM extracted only ONE of the two course
    # codes even though the regex fallback correctly finds both; trusting
    # intent.requested_courses alone silently dropped the second course from
    # the entire request with no explanation.
    llm_courses = list(intent.requested_courses) if intent is not None and intent.requested_courses else []
    regex_courses = parse_requested_courses(question)
    seen_pairs = {(s.upper(), n) for s, n in llm_courses}
    requested_courses = llm_courses + [c for c in regex_courses if (c[0].upper(), c[1]) not in seen_pairs]

    # Subject restriction: use LLM-extracted subject_filter, then regex, then None
    if intent is not None and intent.subject_filter:
        question_subject_filter = intent.subject_filter
    else:
        question_subject_filter = parse_subject_filter(question)

    # Hard constraints — regex first, fall back to LLM-extracted values
    excluded_days = parse_excluded_days(question)
    if not excluded_days and intent is not None and getattr(intent, "excluded_days", None):
        excluded_days = set(intent.excluded_days)
    min_gpa = parse_min_gpa(question)
    if min_gpa is None and intent is not None and getattr(intent, "min_gpa", None) is not None:
        min_gpa = float(intent.min_gpa)
    min_rmp = parse_min_rmp(question)
    if min_rmp is None and intent is not None and getattr(intent, "min_rmp", None) is not None:
        min_rmp = float(intent.min_rmp)

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

    # ── Required courses for the user's major ───────────────────────────────────
    # Prefer the precomputed startup index (O(1)); live Supabase query only when
    # indexes isn't available (e.g. tests, or backend not fully initialized).
    required_course_codes: set[str] = set()
    if major and indexes is not None and getattr(indexes, "required_by_major", None) is not None:
        major_lower = major.lower().strip()
        codes = indexes.required_by_major.get(major_lower)
        if codes is None:
            # Fuzzy match against indexed major names — same scoring as the old live query
            best_name, best_score = None, 0
            for name in indexes.required_by_major:
                if name == major_lower:
                    best_name = name
                    break
                words_in_common = len(set(name.split()) & set(major_lower.split()))
                if words_in_common > best_score:
                    best_score = words_in_common
                    best_name = name
            codes = indexes.required_by_major.get(best_name, set()) if best_name else set()
        required_course_codes = {re.sub(r"\s+", "", code).lower() for code in codes}
    elif major:
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
    # Prefer the startup-loaded sections DataFrame (all rows, no PostgREST cap).
    if sections_df is not None and not sections_df.empty:
        sdf = sections_df
        if question_subject_filter:
            sdf = sdf[sdf["subject"].str.upper() == question_subject_filter]
        elif requested_courses:
            subjects = list({s for s, _ in requested_courses})
            if len(subjects) == 1:
                sdf = sdf[sdf["subject"].str.upper() == subjects[0]]
        # Convert to records; replace float NaN with None for numeric columns.
        # Avoid .where(notna(), None) — it crashes on pandas 2+ when the `days`
        # column contains Python lists (pd.notna(list) returns an array, not a scalar).
        import math
        all_sections = [
            {k: (None if isinstance(v, float) and math.isnan(v) else v) for k, v in rec.items()}
            for rec in sdf.to_dict("records")
        ]
    else:
        # Live fallback — paginate, since PostgREST caps any single response at
        # 1,000 rows regardless of .limit().
        all_sections = []
        offset = 0
        try:
            while True:
                pq = client.table("sections").select(
                    "crn, subject, course_number, instructor, days, start_time, "
                    "end_time, location, seats, enrolled, open_seats, credits"
                ).eq("term", get_settings().current_term)
                if question_subject_filter:
                    pq = pq.eq("subject", question_subject_filter)
                elif requested_courses:
                    subjects = list({s for s, _ in requested_courses})
                    if len(subjects) == 1:
                        pq = pq.eq("subject", subjects[0])
                page = pq.order("id").range(offset, offset + 999).execute().data or []
                all_sections.extend(page)
                if len(page) < 1000:
                    break
                offset += 1000
        except Exception as exc:
            return (
                f"I couldn't load Fall 2026 section data right now ({exc}). "
                "Try again in a moment, or browse the Schedule page directly."
            ), [], [], {}

    # ── Sort goal ─────────────────────────────────────────────────────────────
    sort_goal = getattr(intent, "sort_goal", "highest_gpa") if intent else "highest_gpa"
    q_low = question.lower()
    wants_grad = any(w in q_low for w in ["grad", "graduate", "master", "phd", "5000-level"])
    wants_easy = sort_goal == "highest_gpa" or any(
        w in q_low for w in ["easiest", "easy", "best grades", "highest gpa", "chill", "relaxed", "laid back"]
    )
    wants_hard = sort_goal == "lowest_gpa" or any(
        w in q_low for w in ["hardest", "tough", "brutal", "lowest gpa"]
    )

    # ── Instructor GPA map (must be before filter so min_gpa can use it) ───────
    # Fast path: precomputed startup indexes (O(1) per instructor). Fallback:
    # one-pass scan of the grades frame for callers without indexes (tests).
    inst_gpa: dict[str, float] = {}
    if indexes is not None and getattr(indexes, "instructor_by_last", None):
        inst_gpa = {
            last: agg.weighted_gpa
            for last, agg in indexes.instructor_by_last.items()
            if agg.weighted_gpa is not None
        }
    elif df is not None:
        try:
            gpa_df = df.copy()
            if question_subject_filter:
                gpa_df = gpa_df[gpa_df["Subject"].str.upper() == question_subject_filter]
            gpa_df = gpa_df.dropna(subset=["GPA", "Graded Enrollment"])
            sums: dict[str, float] = {}
            counts: dict[str, float] = {}
            for inst, gpa, enroll in zip(
                gpa_df["Instructor"], gpa_df["GPA"], gpa_df["Graded Enrollment"]
            ):
                last = _last(str(inst))
                if not last:
                    continue
                e = float(enroll or 0)
                sums[last] = sums.get(last, 0.0) + float(gpa or 0) * e
                counts[last] = counts.get(last, 0.0) + e
            inst_gpa = {
                last: round(sums[last] / counts[last], 3)
                for last in sums if counts.get(last)
            }
        except Exception:
            inst_gpa = {}

    # ── Instructor RMP map (must be before filter so min_rmp can use it) ───────
    inst_rmp: dict[str, float] = {}
    if indexes is not None and getattr(indexes, "rmp_by_last", None):
        inst_rmp = {last: rec["rating"] for last, rec in indexes.rmp_by_last.items()}
    elif rmp_df is not None and not rmp_df.empty and "rmp_rating" in rmp_df.columns:
        try:
            for _, row in rmp_df.dropna(subset=["rmp_rating"]).iterrows():
                last = _last(str(row["name"]))
                if last and last not in inst_rmp:
                    inst_rmp[last] = float(row["rmp_rating"])
        except Exception:
            inst_rmp = {}

    def _inst_gpa(s: dict) -> float:
        last = _last(s.get("instructor") or "")
        return inst_gpa.get(last, 0.0)

    # ── Filter ─────────────────────────────────────────────────────────────────
    filtered = []
    for sec in all_sections:
        if _is_virtual(sec):
            continue

        if not wants_grad:
            try:
                if int(sec.get("course_number") or 0) >= 5000:
                    continue
            except (TypeError, ValueError):
                pass

        st = sec.get("start_time") or ""
        et = sec.get("end_time")   or ""
        if not st or not et:
            continue

        if _pad_time(st) < start_limit or _pad_time(et) > end_limit:
            continue

        course_key = re.sub(r"\s+", "", f"{sec['subject']}{sec['course_number']}").lower()
        if course_key in courses_taken:
            continue

        if requested_courses:
            if not any(
                sec["subject"].upper() == s and sec["course_number"] == n
                for s, n in requested_courses
            ):
                continue

        if question_subject_filter:
            if sec["subject"].upper() != question_subject_filter:
                continue

        if (sec.get("open_seats") or 0) <= 0:
            continue

        # Exclude sections that meet on excluded days
        if excluded_days:
            sec_days = set(sec.get("days") or [])
            if sec_days & excluded_days:
                continue

        # Enforce minimum instructor GPA
        if min_gpa is not None:
            last = _last(sec.get("instructor") or "")
            igpa = inst_gpa.get(last, 0.0)
            if igpa > 0 and igpa < min_gpa:
                continue

        # Enforce minimum instructor RMP rating
        if min_rmp is not None:
            last = _last(sec.get("instructor") or "")
            irmp = inst_rmp.get(last)
            if irmp is not None and irmp < min_rmp:
                continue

        filtered.append(sec)

    if not filtered:
        constraints = []
        if excluded_days:
            day_names_rev = {v: k for k, v in _DAY_NAMES.items()}
            constraints.append("no " + "/".join(day_names_rev.get(d, d) for d in sorted(excluded_days)) + " classes")
        if min_gpa:
            constraints.append(f"GPA ≥ {min_gpa}")
        if min_rmp:
            constraints.append(f"RMP ≥ {min_rmp}")
        constraint_str = (", " + ", ".join(constraints)) if constraints else ""
        time_str = f"{_fmt_time_12h(start_limit)}–{_fmt_time_12h(end_limit)}"
        subj_str = f" {question_subject_filter}" if question_subject_filter else ""
        if requested_courses:
            course_str = ", ".join(f"{s} {n}" for s, n in requested_courses)
            return (
                f"I couldn't find open in-person sections for {course_str} in Fall 2026 "
                f"within {time_str}{constraint_str}. "
                "Try the Schedule page to browse and add sections manually."
            ), [], [], {}
        return (
            f"I couldn't find any open{subj_str} sections between {time_str}{constraint_str} for Fall 2026. "
            "Try relaxing some constraints or browsing the Schedule page manually."
        ), [], [], {}

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
        title = (s.get("title") or "").lower()
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

        # Tier 3b: RMP rating — tiebreaker after GPA when the student wants easy.
        # Normalize: RMP is 1-5, GPA is 0-4. Blend as tiebreaker after GPA.
        rmp = inst_rmp.get(_last(s.get("instructor") or ""))
        rmp_score = -(rmp or 0.0) if (wants_easy and rmp) else 0.0

        # Tier 3c: prefer later start times for "easiest"/"chillest" framing —
        # verified live that "easiest"/"chillest" schedule requests still
        # included 9-9:30 AM classes despite that framing implying fewer
        # early classes. Mild tiebreaker after GPA/RMP, not an override.
        # Always a plain int (0 when not wants_easy) so tuple comparison
        # never mixes types.
        early_penalty = -_time_to_minutes(s.get("start_time")) if wants_easy else 0

        # Tier 4: open seats
        seats_open = (s.get("seats") or 0) - (s.get("enrolled") or 0)

        return (-is_required, major_rank, -interest_match, gpa_rank, rmp_score, early_penalty, -seats_open)

    candidates.sort(key=_relevance_score)

    # "One coding class, one math class, one writing class" names categories,
    # not specific courses — the greedy picker below otherwise has no notion
    # of category balance and (verified live) can return an all-CS schedule
    # for a request that explicitly asked for variety. Bubble the single best
    # candidate from each named category to the front so the greedy loop
    # considers them before falling back to pure relevance/GPA ordering.
    named_categories = parse_category_requirements(question)
    if len(named_categories) >= 2:
        boosted: list[dict] = []
        used_subjects: set[str] = set()
        for subjects in named_categories.values():
            pick = next(
                (c for c in candidates if c["subject"].upper() in subjects
                 and c["subject"].upper() not in used_subjects),
                None,
            )
            if pick is not None:
                boosted.append(pick)
                used_subjects.add(pick["subject"].upper())
        remaining = [c for c in candidates if c not in boosted]
        candidates = boosted + remaining

    # ── Resolve target credits ─────────────────────────────────────────────────
    target_credits = getattr(intent, "target_credits", None)
    if not target_credits:
        # Regex fallback: "19 credits", "19-credit", "19cr"
        m = re.search(r"\b(\d{1,2})\s*(?:credit|cr)\b", question.lower())
        if m:
            target_credits = int(m.group(1))

    # ── Greedy conflict-free schedule ──────────────────────────────────────────
    def _get_cred(s: dict) -> float:
        raw = s.get("credits")
        try:
            c = float(raw) if raw is not None else 3.0
            return c if c == c else 3.0  # guard NaN
        except (TypeError, ValueError):
            return 3.0

    schedule: list[dict] = []
    credits_so_far = 0.0

    if target_credits:
        # Pass 1 (strict): never exceed target_credits — prefer undershoot
        strict_sched: list[dict] = []
        strict_credits = 0.0
        for cand in candidates:
            if any(_conflicts(cand, s) for s in strict_sched):
                continue
            c = _get_cred(cand)
            if strict_credits + c > target_credits:
                continue  # would overshoot — skip this course
            strict_sched.append(cand)
            strict_credits += c
            if strict_credits >= target_credits - 0.5:
                break
            if len(strict_sched) >= 10:
                break

        # Pass 2 (relaxed): allow any overshoot — used as fallback when credits
        # don't divide evenly (e.g. all 3-cr courses, 19-credit target → 18 vs 21)
        relaxed_sched: list[dict] = []
        relaxed_credits = 0.0
        for cand in candidates:
            if any(_conflicts(cand, s) for s in relaxed_sched):
                continue
            relaxed_sched.append(cand)
            relaxed_credits += _get_cred(cand)
            if relaxed_credits >= target_credits:
                break
            if len(relaxed_sched) >= 10:
                break

        # Pick the result closest to the requested target
        strict_diff  = abs(strict_credits  - target_credits) if strict_sched  else float("inf")
        relaxed_diff = abs(relaxed_credits - target_credits) if relaxed_sched else float("inf")
        if strict_diff <= relaxed_diff:
            schedule, credits_so_far = strict_sched, strict_credits
        else:
            schedule, credits_so_far = relaxed_sched, relaxed_credits
    else:
        for cand in candidates:
            if not any(_conflicts(cand, s) for s in schedule):
                schedule.append(cand)
                credits_so_far += _get_cred(cand)
            if len(schedule) >= MAX_COURSES:
                break

    if not schedule:
        return (
            "I found courses in that time range but couldn't build a conflict-free schedule. "
            "Try the Browse Courses page to add sections manually."
        ), [], [], {}

    # A requested course can silently vanish from the final schedule two ways:
    # no section survived the day/time/GPA filter (never entered `candidates`),
    # or every surviving section conflicted with something already picked by
    # the greedy loop. Either way, silently returning fewer courses than asked
    # for — with no explanation — misleads the student into thinking the
    # request was fully satisfied. Report exactly what happened to each one.
    dropped_requested: list[str] = []
    if requested_courses:
        scheduled_pairs = {(s["subject"].upper(), str(s["course_number"]).strip()) for s in schedule}
        candidate_pairs = {(c["subject"].upper(), str(c["course_number"]).strip()) for c in candidates}
        for subj, num in requested_courses:
            pair = (subj.upper(), str(num).strip())
            if pair in scheduled_pairs:
                continue
            label = f"{subj.upper()} {num}"
            if pair not in candidate_pairs:
                dropped_requested.append(f"{label} (no section fit the stated constraints)")
            else:
                dropped_requested.append(f"{label} (its sections conflicted with the rest of the schedule)")

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
            "credits":      (lambda v: float(v) if (v is not None and v == v) else 0.0)(s.get("credits")),
            "term":         get_settings().current_term,
        }
        for s in schedule
    ]

    total_credits = sum(s["credits"] for s in schedule_actions)
    course_list   = ", ".join(
        f"{s['subject']} {s['courseNumber']} "
        f"({_fmt_days_compact(s['days'])}, {_fmt_time_range_12h(s['startTime'], s['endTime'])}"
        f"{', ' + _last_name_only(s['instructor']) if s['instructor'] != 'Staff' else ''})"
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

    # Notify user about constraints that couldn't be fully verified
    caveats: list[str] = []

    # Prerequisite warnings — informational only, never blocks course selection.
    # Skip silently if courses_taken wasn't populated (we have nothing to check against).
    if courses_taken and indexes is not None and getattr(indexes, "course_prerequisites", None):
        for s in schedule:
            course_code = f"{s['subject'].upper()} {s['course_number']}"
            prereq_text = indexes.course_prerequisites.get(
                (s["subject"].upper(), str(s["course_number"]).strip())
            )
            if not prereq_text:
                continue
            for p_subj, p_num in re.findall(r"\b([A-Za-z]{2,5})\s*-?\s*(\d{4})\b", prereq_text):
                p_code = f"{p_subj.upper()} {p_num}"
                p_key = re.sub(r"\s+", "", p_code).lower()
                if p_key not in courses_taken:
                    caveats.append(
                        f"{course_code} lists {p_code} as a prerequisite — "
                        "confirm you've completed it before registering."
                    )

    if min_rmp is not None:
        no_rmp = [
            s for s in schedule
            if inst_rmp.get(_last(s.get("instructor") or "")) is None
        ]
        if no_rmp:
            names = ", ".join(
                s.get("instructor") or "Staff" for s in no_rmp if s.get("instructor")
            )
            caveats.append(
                f"Some instructors ({names}) have no RMP data on file, "
                f"so I couldn't confirm the {min_rmp}+ rating requirement for them."
            )
    if min_gpa is not None:
        no_gpa = [
            s for s in schedule
            if not inst_gpa.get(_last(s.get("instructor") or ""))
        ]
        if no_gpa:
            names = ", ".join(
                s.get("instructor") or "Staff" for s in no_gpa if s.get("instructor")
            )
            caveats.append(
                f"Some instructors ({names}) have no historical grade data, "
                f"so I couldn't confirm the {min_gpa}+ GPA requirement for them."
            )
    if target_credits and abs(credits_so_far - target_credits) > 0.5:
        if credits_so_far < target_credits:
            caveats.append(
                f"I built an {credits_so_far:.0f}-credit schedule (you asked for {target_credits}) "
                f"— adding another course would have exceeded your target given available sections "
                "and your other constraints."
            )
        else:
            caveats.append(
                f"I built a {credits_so_far:.0f}-credit schedule (you asked for {target_credits}) "
                f"— I couldn't find a combination that summed to exactly {target_credits} credits "
                "without violating your other constraints."
            )
    if excluded_days and schedule:
        # Verify no Friday (or other excluded day) slipped through
        day_names_rev = {v: k for k, v in _DAY_NAMES.items()}
        violations = []
        for s in schedule:
            bad = set(s.get("days") or []) & excluded_days
            if bad:
                violated_names = "/".join(day_names_rev.get(d, d).capitalize() for d in bad)
                violations.append(f"{s['subject']} {s['course_number']} ({violated_names})")
        if violations:
            caveats.append(
                f"Warning: I couldn't find alternatives that avoid all excluded days — "
                f"{', '.join(violations)} still meet on those days."
            )

    if dropped_requested:
        caveats.append(
            "Couldn't include: " + "; ".join(dropped_requested) + "."
        )

    if caveats:
        answer += " Note: " + " ".join(caveats)

    return answer, [], [], {"schedule_actions": schedule_actions}

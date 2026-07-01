import re
import difflib
import pandas as pd
from app.data.loader import find_col
from app.data.recency import add_recency_columns, weighted_average


_SUBJECT_BLOCKLIST = {
    "which", "what", "when", "where", "who", "why", "how", "the", "for",
    "with", "from", "have", "has", "are", "and", "but", "not", "this",
    "that", "any", "all", "some", "can", "will", "does", "did", "was",
    "were", "been", "give", "get", "show", "tell", "find", "also", "does",
    "than", "then", "does", "over", "each", "most", "many", "more", "very",
    "help", "want", "need", "know", "look", "take", "make", "good", "best",
    "rate", "data", "info", "list", "like", "just", "only", "last", "next",
}


def extract_course_parts(text: str) -> tuple[str | None, str | None]:
    """
    Extract a VT subject code and course number from free text.
    Subject-prefixed numbers (e.g. 'CS 3114') are always accepted.
    Standalone 4-digit numbers that look like calendar years (2017-2035)
    are rejected so questions like 'CS grades in 2023' don't misroute.
    Common question words (which, what, how, etc.) are never treated as subjects.
    """
    subject_match = re.search(r"\b([A-Za-z]{2,5})\s*-?\s*(\d{4})\b", text)
    if subject_match:
        subj = subject_match.group(1)
        if subj.lower() not in _SUBJECT_BLOCKLIST:
            return subj.upper(), subject_match.group(2)

    number_match = re.search(r"\b(\d{4})\b", text)
    if number_match:
        n = number_match.group(1)
        if not (2017 <= int(n) <= 2035):
            return None, n

    return None, None


def detect_course_level(question: str) -> tuple[int | None, int | None]:
    match = re.search(r"\b([1-5])000[-\s]?level\b", question.lower())
    if not match:
        return None, None
    level = int(match.group(1))
    return level * 1000, level * 1000 + 999


def _count_terms(group: pd.DataFrame) -> int:
    """
    Count distinct semester appearances using (Academic Year, Term) pairs.
    An instructor teaching two sections in the same semester counts as 1 term,
    not 2 — fixes the previous int(len(group)) bug.
    """
    key_cols = [c for c in ("Academic Year", "Term") if c in group.columns]
    if key_cols:
        return int(group[key_cols].drop_duplicates().shape[0])
    return int(len(group))


def _prepare(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, str]]:
    out = add_recency_columns(df)
    cols = {
        "gpa": find_col(out, ["GPA"]),
        "enrollment": find_col(out, ["Graded Enrollment", "Enrollment"]),
        "a": find_col(out, ["A (%)"]),
        "a_minus": find_col(out, ["A− (%)", "A- (%)"]),
        "f": find_col(out, ["F (%)"]),
        "withdraws": find_col(out, ["Withdraws", "W", "Withdrawals"]),
    }
    if not cols["gpa"] or not cols["enrollment"]:
        raise ValueError("Missing GPA or Graded Enrollment column.")

    numeric_cols = [c for c in cols.values() if c] + ["Recency Weight"]
    for c in numeric_cols:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce")

    if cols["a"] and cols["a_minus"]:
        out["A Range (%)"] = out[cols["a"]].fillna(0) + out[cols["a_minus"]].fillna(0)
    elif cols["a"]:
        out["A Range (%)"] = out[cols["a"]]
    else:
        out["A Range (%)"] = pd.NA

    out["F Rate (%)"] = out[cols["f"]] if cols["f"] else pd.NA
    out["Withdraws Clean"] = out[cols["withdraws"]].fillna(0) if cols["withdraws"] else 0
    out["Course No. Numeric"] = pd.to_numeric(out["Course No."], errors="coerce")
    out["Course"] = out["Subject"].astype(str) + " " + out["Course No."].astype(str)
    return out, cols


def add_confidence_scores(result_df: pd.DataFrame) -> pd.DataFrame:
    if result_df is None or result_df.empty:
        return result_df
    out = result_df.copy()

    def score(row):
        s = 0
        students = float(row.get("Total Students", 0) or 0)
        terms = float(row.get("Terms Taught", 0) or 0)
        f_rate = row.get("Avg F Rate (%)")
        gpa = row.get("Avg GPA")
        if students >= 200: s += 40
        elif students >= 100: s += 30
        elif students >= 30: s += 20
        else: s += 5
        if terms >= 5: s += 30
        elif terms >= 3: s += 20
        elif terms >= 1: s += 10
        if pd.notna(f_rate):
            if f_rate <= 3: s += 15
            elif f_rate <= 7: s += 10
            else: s += 5
        if pd.notna(gpa):
            if gpa >= 3.5: s += 15
            elif gpa >= 3.0: s += 10
            else: s += 5
        return min(int(s), 100)

    out["Confidence Score"] = out.apply(score, axis=1)
    out["Confidence Label"] = out["Confidence Score"].apply(
        lambda x: "High" if x >= 75 else "Medium" if x >= 50 else "Low"
    )
    return out


def course_profile(df: pd.DataFrame, subject: str | None, course_no: str, min_students: int, use_recency: bool) -> pd.DataFrame:
    work, cols = _prepare(df)
    mask = work["Course No."].astype(str).str.strip() == str(course_no).strip()
    if subject:
        mask &= work["Subject"].astype(str).str.upper() == subject.upper()
    course_df = work[mask].dropna(subset=["Instructor", cols["gpa"], cols["enrollment"]]).copy()
    rows = []
    for instructor, group in course_df.groupby("Instructor"):
        total_students = group[cols["enrollment"]].sum()
        if total_students < min_students:
            continue
        rows.append({
            "Instructor": instructor,
            "Avg GPA": round(weighted_average(group, cols["gpa"], cols["enrollment"], use_recency) or 0, 3),
            "Avg A Range (%)": round(weighted_average(group, "A Range (%)", cols["enrollment"], use_recency) or 0, 2),
            "Avg F Rate (%)": round(weighted_average(group, "F Rate (%)", cols["enrollment"], use_recency) or 0, 2),
            "Total Withdraws": int(group["Withdraws Clean"].sum()),
            "Total Students": int(total_students),
            "Terms Taught": _count_terms(group),
            "Latest Year": int(group["End Year"].max()) if pd.notna(group["End Year"].max()) else "Unknown",
        })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    out = out.sort_values(["Avg GPA", "Total Students"], ascending=[False, False])
    return add_confidence_scores(out)


def _best_instructor_match(candidates: "list[str]", query: str) -> "str | None":
    """
    Pick the single best instructor name from candidates (all contain `query`).
    Prefers names where every word in the query appears, then exact word-boundary
    matches, then shortest name. Returns None if candidates is empty.
    """
    q_parts = query.strip().lower().split()
    scored = []
    for name in candidates:
        n = name.strip().lower()
        all_parts = int(all(p in n for p in q_parts)) * 2
        exact_last = int(bool(re.search(r'\b' + re.escape(q_parts[-1]) + r'\b', n)))
        scored.append((name, all_parts + exact_last, -len(name)))
    scored.sort(key=lambda x: (x[1], x[2]), reverse=True)
    return scored[0][0] if scored else None


def professor_profile(df: pd.DataFrame, professor_query: str, min_students: int, use_recency: bool) -> pd.DataFrame:
    work, cols = _prepare(df)
    # Broad match — find rows where any instructor name contains the query
    broad = work[
        work["Instructor"].astype(str).str.contains(professor_query, case=False, na=False)
    ]
    # Narrow to ONE instructor so courses from different people sharing a last
    # name (e.g. "Lewis" matching John Lewis CS + Mary Lewis PHIL) are never mixed
    best_name = _best_instructor_match(broad["Instructor"].dropna().unique().tolist(), professor_query)
    if best_name is None:
        return pd.DataFrame()
    p_df = broad[
        broad["Instructor"].str.lower() == best_name.lower()
    ].dropna(subset=["Subject", "Course No.", "Course Title", cols["gpa"], cols["enrollment"]])
    rows = []
    for (subject, course_no, title), group in p_df.groupby(["Subject", "Course No.", "Course Title"]):
        total_students = group[cols["enrollment"]].sum()
        if total_students < min_students:
            continue
        rows.append({
            "Course": f"{subject} {course_no}",
            "Course Title": title,
            "Avg GPA": round(weighted_average(group, cols["gpa"], cols["enrollment"], use_recency) or 0, 3),
            "Avg A Range (%)": round(weighted_average(group, "A Range (%)", cols["enrollment"], use_recency) or 0, 2),
            "Avg F Rate (%)": round(weighted_average(group, "F Rate (%)", cols["enrollment"], use_recency) or 0, 2),
            "Total Withdraws": int(group["Withdraws Clean"].sum()),
            "Total Students": int(total_students),
            "Terms Taught": _count_terms(group),
            "Latest Year": int(group["End Year"].max()) if pd.notna(group["End Year"].max()) else "Unknown",
        })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    out = out.sort_values(["Total Students", "Avg GPA"], ascending=[False, False])
    return add_confidence_scores(out)


def _normalize_question(q: str) -> str:
    """
    Light normalization to handle common typos and alternate phrasings
    before keyword matching. All transforms are safe rewrites — they don't
    change meaning, only surface form.
    """
    replacements = [
        # F-rate variants → canonical "f rate"
        (r"\bf[\s-]?rate\b",          "f rate"),
        (r"\bfail(?:ure)?\s+rate\b",  "f rate"),
        (r"\bfailing\s+rate\b",       "f rate"),
        (r"\bfailure\b",              "fail"),
        # Common direction typos
        (r"\bhighst\b",   "highest"),
        (r"\bhigest\b",   "highest"),
        (r"\bworset\b",   "worst"),
        (r"\bfewset\b",   "fewest"),
        # Withdrawal variants
        (r"\bwithdraws?\b",     "withdraw"),
        (r"\bw(?:\s+|-)rate\b", "withdraw rate"),
    ]
    for pattern, repl in replacements:
        q = re.sub(pattern, repl, q)
    return q


_VT_SUBJECT_CODES = {
    "CS", "ECE", "MATH", "STAT", "PHYS", "CHEM", "BIOL", "ENGL", "HIST",
    "POLS", "PSYC", "SOC", "ECON", "FIN", "MGT", "MKTG", "ACIS", "BIT",
    "ME", "AOE", "CEE", "MSE", "ISE", "BME", "CHE", "BSE", "ESM", "GEOS",
    "AAEC", "APSC", "HORT", "PPWS", "HNFE", "NSCI", "HD", "NTR", "BCHS",
    "ARCH", "BLD", "LARC", "UAPP", "ART", "THEA", "MUS", "COMM",
    "PHIL", "REL", "CNST", "SPAN", "FREC", "SPIA", "PAPA",
}

_SUBJECT_SKIP = {
    "THE", "ANY", "ALL", "EACH", "WHAT", "WHICH", "BEST", "TOP",
    "LOW", "HIGH", "HARD", "EASY", "GOOD", "BAD", "NEW", "OLD",
    "BIG", "MANY", "MOST", "SOME", "VERY", "SAME", "NEXT", "LAST",
    "MORE", "LESS", "THAT", "THIS", "BOTH", "ONLY", "OPEN",
    "LEVEL", "LOWER", "UPPER", "INTRO", "BASIC", "CORE", "GRAD",
    "UNDER", "LARGE", "SMALL", "MUCH", "EVEN", "EVER", "ALSO",
    "SUCH", "LIKE", "HAVE", "WITH", "FROM", "THAN", "WHEN",
}


def detect_subject_filter(question: str) -> str | None:
    """
    Extract a standalone subject filter from questions like
    'which cs professor' or 'what ece course'. Returns uppercase
    subject code (e.g. 'CS', 'ECE') or None.
    Only fires when there is no course number present.

    Two-pass strategy:
    1. Regex: look for a 2-5 letter word immediately before 'professor',
       'instructor', 'course', 'class', 'dept', or 'courses'.
    2. Fuzzy fallback: scan every word against known VT subject codes
       using difflib, accepting ≥0.85 similarity. This catches 'mth' → MATH,
       'cse' → CS, 'ece' when it appears mid-sentence, etc.
    """
    upper = question.upper()

    # Pass 1 — positional regex (fast, high-precision)
    m = re.search(
        r"\b([A-Z]{2,5})\s+(?:PROFESSOR|INSTRUCTOR|COURSE|COURSES|CLASS|CLASSES|DEPT|DEPARTMENT|PROF|PROFS)\b",
        upper
    )
    if m:
        code = m.group(1)
        if code not in _SUBJECT_SKIP:
            # If it's already a known code, return it directly
            if code in _VT_SUBJECT_CODES:
                return code
            # Otherwise try fuzzy-matching it
            matches = difflib.get_close_matches(code, _VT_SUBJECT_CODES, n=1, cutoff=0.8)
            if matches:
                return matches[0]

    # Pass 2 — fuzzy scan of every token (catches "which mth courses", "best cse prof")
    for word in re.findall(r"\b[A-Z]{2,5}\b", upper):
        if word in _SUBJECT_SKIP:
            continue
        if word in _VT_SUBJECT_CODES:
            return word
        matches = difflib.get_close_matches(word, _VT_SUBJECT_CODES, n=1, cutoff=0.85)
        if matches:
            return matches[0]

    return None


def detect_natural_params(question: str) -> dict:
    raw = question.lower()
    q   = _normalize_question(raw)

    def match_float(patterns):
        for p in patterns:
            m = re.search(p, q)
            if m: return float(m.group(1))
        return None

    def match_int(patterns, default=None):
        for p in patterns:
            m = re.search(p, q)
            if m: return int(m.group(1))
        return default

    # Direction helpers — check the full question for intent
    wants_highest = any(t in q for t in ["highest", "most", "worst", "largest", "max", "top"])
    wants_lowest  = any(t in q for t in ["lowest", "fewest", "least", "best", "min", "low"])

    sort_goal = "highest_gpa"

    # ── F rate ──────────────────────────────────────────────────────
    is_f_query = any(t in q for t in ["f rate", "fail"])
    if is_f_query:
        if wants_highest:
            sort_goal = "highest_f_rate"
        else:
            sort_goal = "lowest_f_rate"

    # ── Withdrawals ─────────────────────────────────────────────────
    elif any(t in q for t in ["most withdraw", "highest withdraw", "most withdrawals", "most withdraws"]):
        sort_goal = "most_withdraws"
    elif any(t in q for t in ["lowest withdraw", "fewest withdraw", "low withdraw"]):
        sort_goal = "lowest_withdraws"
    elif "withdraw" in q:
        sort_goal = "most_withdraws" if wants_highest else "lowest_withdraws"

    # ── A rate ──────────────────────────────────────────────────────
    elif any(t in q for t in ["highest a", "a rate", "most a"]):
        sort_goal = "highest_a_rate"

    # ── GPA ─────────────────────────────────────────────────────────
    elif any(t in q for t in ["lowest gpa", "worst gpa", "hardest"]):
        sort_goal = "lowest_gpa"

    # ── Sample / reliability ─────────────────────────────────────────
    elif any(t in q for t in ["sample size", "most data", "reliable"]):
        sort_goal = "largest_sample"

    # ── Times taught ─────────────────────────────────────────────────
    elif "taught" in q and ("times" in q or "terms" in q):
        sort_goal = "times_taught"

    return {
        "min_students": match_int([r"at least (\d+) students", r"minimum (\d+) students", r"(\d+)\+ students"], 30),
        "min_gpa": match_float([r"gpa above ([0-4]\.\d+)", r"gpa over ([0-4]\.\d+)", r"gpa at least ([0-4]\.\d+)", r"above ([0-4]\.\d+) gpa"]),
        "min_terms": match_int([r"at least (\d+) times", r"taught at least (\d+)", r"at least (\d+) terms", r"(\d+)\+ terms"], None),
        "sort_goal": sort_goal,
    }


def _apply_if_nonempty(df: pd.DataFrame, mask: pd.Series) -> pd.DataFrame:
    """Apply a boolean mask only if it leaves at least one row. Otherwise return df unchanged."""
    narrowed = df[mask]
    return narrowed if not narrowed.empty else df


def natural_filter(
    df: pd.DataFrame,
    question: str,
    top_n: int,
    use_recency: bool,
    *,
    # Pre-extracted params from LLM intent — when provided, skip keyword extraction
    sort_goal: str | None = None,
    min_students: int | None = None,
    min_gpa: float | None = None,
    min_terms: int | None = None,
    subject: str | None = None,
    course_no: str | None = None,
    level_low: int | None = None,
    level_high: int | None = None,
    wants_professors: bool | None = None,
) -> pd.DataFrame:
    # Use pre-extracted params when available, otherwise fall back to keyword extraction
    if sort_goal is None:
        params = detect_natural_params(question)
        sort_goal    = params["sort_goal"]
        min_students = params["min_students"] if min_students is None else min_students
        min_gpa      = params.get("min_gpa")  if min_gpa    is None else min_gpa
        min_terms    = params.get("min_terms") if min_terms  is None else min_terms
    else:
        if min_students is None:
            min_students = 30

    if subject is None and course_no is None:
        subject, course_no = extract_course_parts(question)
        if subject is None and course_no is None:
            subject = detect_subject_filter(question)

    if level_low is None:
        level_low, level_high = detect_course_level(question)

    # Rebuild params dict for downstream sort logic
    params = {
        "sort_goal": sort_goal,
        "min_students": min_students,
        "min_gpa": min_gpa,
        "min_terms": min_terms,
    }

    work, cols = _prepare(df)

    # Infer wants_professors from intent when provided, otherwise from keywords
    if wants_professors is None:
        wants_professors = (
            any(t in question.lower() for t in ["professor", "instructor", "taught"])
            or course_no is not None
        )
    group_cols = (
        ["Subject", "Course No.", "Course Title", "Instructor"]
        if wants_professors
        else ["Subject", "Course No.", "Course Title"]
    )

    # ── Aggregate rows — no hard min_students cut yet ─────────────────
    rows = []
    for keys, group in work.groupby(group_cols):
        if not isinstance(keys, tuple):
            keys = (keys,)
        record = dict(zip(group_cols, keys))
        total_students = group[cols["enrollment"]].sum()
        avg_gpa = weighted_average(group, cols["gpa"], cols["enrollment"], use_recency)
        row = {
            "Subject":            record["Subject"],
            "Course No.":         str(record["Course No."]),
            "Course No. Numeric": pd.to_numeric(record["Course No."], errors="coerce"),
            "Course Title":       record["Course Title"],
            "Course":             f"{record['Subject']} {record['Course No.']}",
            "Avg GPA":            round(avg_gpa or 0, 3),
            "Avg A Range (%)":    round(weighted_average(group, "A Range (%)", cols["enrollment"], use_recency) or 0, 2),
            "Avg F Rate (%)":     round(weighted_average(group, "F Rate (%)", cols["enrollment"], use_recency) or 0, 2),
            "Total Withdraws":    int(group["Withdraws Clean"].sum()),
            "Total Students":     int(total_students),
            "Terms Taught":       _count_terms(group),
            "Latest Year":        int(group["End Year"].max()) if pd.notna(group["End Year"].max()) else "Unknown",
        }
        if wants_professors:
            row["Instructor"] = record["Instructor"]
        rows.append(row)

    out = pd.DataFrame(rows)
    if out.empty:
        return out

    # ── Apply filters with graceful fallback ──────────────────────────
    # Each filter is only applied if it leaves at least one result.
    # This prevents a bad subject detection or an edge-case constraint from
    # silently returning empty when good data exists.

    # Min students — prefer ≥ threshold, but fall back to any data
    min_s = params["min_students"]
    if min_s > 0:
        out = _apply_if_nonempty(out, out["Total Students"] >= min_s)

    # Subject — strict filter: if the user explicitly named a department (ECE, MATH, etc.)
    # and that department has data, restrict to it. If no data exists for that subject,
    # return empty so the caller can surface a proper "no data" message rather than
    # silently showing results from the wrong department.
    if subject:
        subject_mask = out["Subject"].astype(str).str.upper() == subject
        if subject_mask.any():
            out = out[subject_mask]
        else:
            return out.iloc[0:0]  # empty DataFrame — no data for this subject

    # Course number (exact)
    if course_no:
        out = _apply_if_nonempty(out, out["Course No."].astype(str).str.strip() == str(course_no))

    # Course level band (e.g. 2000-level)
    if level_low is not None:
        out = _apply_if_nonempty(
            out,
            (out["Course No. Numeric"] >= level_low) & (out["Course No. Numeric"] <= level_high)
        )

    # Elective filter (3000+)
    if "elective" in question.lower():
        out = _apply_if_nonempty(out, out["Course No. Numeric"] >= 3000)

    # GPA floor
    if params["min_gpa"] is not None:
        out = _apply_if_nonempty(out, out["Avg GPA"] >= params["min_gpa"])

    # Terms-taught floor
    if params["min_terms"] is not None:
        out = _apply_if_nonempty(out, out["Terms Taught"] >= params["min_terms"])

    # ── Sort ──────────────────────────────────────────────────────────
    goal = params["sort_goal"]
    if goal == "highest_f_rate":
        out = out.sort_values(["Avg F Rate (%)", "Total Students"], ascending=[False, False])
    elif goal == "lowest_f_rate":
        out = out.sort_values(["Avg F Rate (%)", "Total Students"], ascending=[True, False])
    elif goal == "lowest_gpa":
        out = out.sort_values(["Avg GPA", "Total Students"], ascending=[True, False])
    elif goal == "most_withdraws":
        out = out.sort_values(["Total Withdraws", "Total Students"], ascending=[False, False])
    elif goal == "lowest_withdraws":
        out["Withdraw Rate Proxy"] = out["Total Withdraws"] / out["Total Students"].replace(0, pd.NA)
        out = out.sort_values(["Withdraw Rate Proxy", "Avg GPA"], ascending=[True, False])
    elif goal == "highest_a_rate":
        out = out.sort_values(["Avg A Range (%)", "Total Students"], ascending=[False, False])
    elif goal == "largest_sample":
        out = out.sort_values(["Total Students", "Terms Taught"], ascending=[False, False])
    elif goal == "times_taught":
        out = out.sort_values(["Terms Taught", "Total Students"], ascending=[False, False])
    else:
        out = out.sort_values(["Avg GPA", "Total Students"], ascending=[False, False])

    return add_confidence_scores(out.head(top_n))

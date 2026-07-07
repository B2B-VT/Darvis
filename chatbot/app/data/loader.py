# app/data/loader.py
#
# Loads grade data from Supabase instead of local CSV files.
# Everything downstream (analytics, vector store, features) continues to
# operate on the same pandas DataFrame shape — only the source changes.

import pandas as pd
from supabase import create_client, Client
from app.config import get_settings

# ── Column mapping: Supabase grades table → DataFrame column names ──
# The analytics layer expects the original VT UDC CSV header names, so
# we rename Supabase's snake_case columns to match them exactly.
_RENAME = {
    "academic_year":     "Academic Year",
    "term":              "Term",
    "subject":           "Subject",
    "course_number":     "Course No.",
    "course_title":      "Course Title",
    "instructor":        "Instructor",
    "gpa":               "GPA",
    "a_pct":             "A (%)",
    "a_minus_pct":       "A- (%)",
    "b_plus_pct":        "B+ (%)",
    "b_pct":             "B (%)",
    "b_minus_pct":       "B- (%)",
    "c_plus_pct":        "C+ (%)",
    "c_pct":             "C (%)",
    "c_minus_pct":       "C- (%)",
    "d_plus_pct":        "D+ (%)",
    "d_pct":             "D (%)",
    "d_minus_pct":       "D- (%)",
    "f_pct":             "F (%)",
    "withdraws":         "Withdraws",
    "graded_enrollment": "Graded Enrollment",
    "crn":               "CRN",
    "credits":           "Credits",
}

NUMERIC_CANDIDATES = [
    "GPA", "A (%)", "A- (%)", "B+ (%)", "B (%)", "B- (%)",
    "C+ (%)", "C (%)", "C- (%)", "D+ (%)", "D (%)", "D- (%)",
    "F (%)", "Withdraws", "Graded Enrollment", "Credits",
]


def _supabase_client() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    return create_client(settings.supabase_url, settings.supabase_key)


def load_from_supabase() -> pd.DataFrame:
    """
    Fetches every row from the Supabase `grades` table in 1 000-row batches
    and returns a DataFrame with the same column names the analytics layer
    expects (matching the original VT UDC CSV headers).
    """
    client = _supabase_client()
    BATCH = 1000
    offset = 0
    all_rows: list[dict] = []

    print("Loading grade data from Supabase...")
    while True:
        # Retry once on transient network failures before propagating the error
        rows = []
        last_err = None
        for attempt in range(2):
            try:
                result = (
                    client.table("grades")
                    .select("*")
                    .order("id")
                    .range(offset, offset + BATCH - 1)
                    .execute()
                )
                rows = result.data or []
                last_err = None
                break
            except Exception as exc:
                last_err = exc
                if attempt == 0:
                    import time
                    print(f"  Batch at offset {offset} failed, retrying: {exc}")
                    time.sleep(1)
        if last_err:
            raise RuntimeError(
                f"Supabase batch failed at offset {offset} after retry: {last_err}"
            ) from last_err

        all_rows.extend(rows)
        print(f"  fetched {len(all_rows):,} rows so far...")
        if len(rows) < BATCH:
            break
        offset += BATCH

    if not all_rows:
        raise ValueError("No rows returned from Supabase grades table. Run import-grades first.")

    df = pd.DataFrame(all_rows)

    # Drop Supabase internal columns we don't need
    drop_cols = [c for c in ("id", "created_at") if c in df.columns]
    if drop_cols:
        df = df.drop(columns=drop_cols)

    # Rename to match the analytics layer's expected headers
    df = df.rename(columns=_RENAME)

    # Coerce numeric columns
    for col in NUMERIC_CANDIDATES:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    required = ["Subject", "Course No.", "Course Title", "Instructor", "GPA", "Graded Enrollment"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"DataFrame is missing required columns after rename: {missing}")

    print(f"Loaded {len(df):,} grade rows from Supabase.")
    return df


def load_rmp_from_supabase() -> pd.DataFrame:
    """
    Fetches ALL rows from the `instructors` table (not just those with RMP ratings).
    Returns a DataFrame keyed on the normalised instructor name, with RMP fields
    present but NaN for instructors who have no RMP data.
    """
    client = _supabase_client()
    BATCH = 1000
    offset = 0
    rows: list[dict] = []
    try:
        while True:
            result = (
                client.table("instructors")
                .select("name, dept, rmp_rating, rmp_difficulty, rmp_count, rmp_tags, avg_gpa, subjects, course_count, rmp_id")
                .order("id")
                .range(offset, offset + BATCH - 1)
                .execute()
            )
            batch = result.data or []
            rows.extend(batch)
            if len(batch) < BATCH:
                break
            offset += BATCH
    except Exception as exc:
        print(f"  Warning: could not load instructor data — {exc}")
        return pd.DataFrame()

    if not rows:
        print("  No instructors found in table.")
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["_key"] = df["name"].str.lower().str.strip()
    df["rmp_rating"] = pd.to_numeric(df["rmp_rating"], errors="coerce")
    df["rmp_difficulty"] = pd.to_numeric(df["rmp_difficulty"], errors="coerce")
    df["rmp_count"] = pd.to_numeric(df["rmp_count"], errors="coerce").fillna(0).astype(int)
    print(f"Loaded {len(df):,} instructors from Supabase ({df['rmp_rating'].notna().sum()} with RMP ratings).")
    return df


def load_sections_from_supabase() -> pd.DataFrame:
    """
    Fetches all Fall 2026 sections with full schedule details.
    Loaded once at startup so all handlers can access schedule data without
    live Supabase queries.
    """
    client = _supabase_client()
    BATCH = 1000
    offset = 0
    all_rows: list[dict] = []

    print("Loading Fall 2026 sections from Supabase...")
    while True:
        try:
            result = (
                client.table("sections")
                .select("crn,term,subject,course_number,instructor,days,start_time,end_time,location,seats,enrolled,credits")
                .eq("term", get_settings().current_term)
                .order("id")
                .range(offset, offset + BATCH - 1)
                .execute()
            )
            rows = result.data or []
        except Exception as exc:
            print(f"  Warning: could not load sections — {exc}")
            return pd.DataFrame()

        all_rows.extend(rows)
        if len(rows) < BATCH:
            break
        offset += BATCH

    if not all_rows:
        return pd.DataFrame()

    df = pd.DataFrame(all_rows)
    for col in ("seats", "enrolled", "credits"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    print(f"Loaded {len(df):,} Fall 2026 sections from Supabase.")
    return df


def load_courses_from_supabase() -> pd.DataFrame:
    """
    Fetches all rows from the `courses` table (3,500+ courses).
    Returns a DataFrame with subject, course_number, title, credits,
    avg_gpa, pathways, description, and prerequisites.
    """
    client = _supabase_client()
    BATCH = 1000
    offset = 0
    all_rows: list[dict] = []

    print("Loading course catalog from Supabase...")
    while True:
        try:
            result = (
                client.table("courses")
                .select("subject, course_number, title, credits, avg_gpa, pathways, total_sections, description, prerequisites")
                .order("subject")
                .order("course_number")
                .range(offset, offset + BATCH - 1)
                .execute()
            )
            rows = result.data or []
        except Exception as exc:
            print(f"  Warning: could not load courses — {exc}")
            return pd.DataFrame()

        all_rows.extend(rows)
        if len(rows) < BATCH:
            break
        offset += BATCH

    if not all_rows:
        return pd.DataFrame()

    df = pd.DataFrame(all_rows)
    df["avg_gpa"] = pd.to_numeric(df["avg_gpa"], errors="coerce")
    df["credits"] = pd.to_numeric(df["credits"], errors="coerce")
    df["total_sections"] = pd.to_numeric(df.get("total_sections", 0), errors="coerce").fillna(0).astype(int)
    # Convenience column used by search helpers
    df["Course"] = df["subject"] + " " + df["course_number"]
    print(f"Loaded {len(df):,} courses from Supabase.")
    return df


def load_requirements_from_supabase() -> pd.DataFrame:
    """
    Fetches all rows from `major_requirements` joined with `majors` so each
    row carries the major name. Returns a DataFrame with major_name, college,
    degree, course_code, course_title, credits_min, and requirement_type.
    """
    client = _supabase_client()
    BATCH = 1000
    offset = 0
    all_rows: list[dict] = []

    print("Loading major requirements from Supabase...")
    while True:
        try:
            result = (
                client.table("major_requirements")
                .select("course_code, course_title, credits_min, credits_max, requirement_type, requirement_group, majors(major_name, college, degree)")
                .not_.is_("course_code", "null")
                .order("id")
                .range(offset, offset + BATCH - 1)
                .execute()
            )
            rows = result.data or []
        except Exception as exc:
            print(f"  Warning: could not load requirements — {exc}")
            return pd.DataFrame()

        # Flatten the nested majors object
        flat = []
        for r in rows:
            major = r.pop("majors", {}) or {}
            r["major_name"] = major.get("major_name", "")
            r["college"]    = major.get("college", "")
            r["degree"]     = major.get("degree", "")
            flat.append(r)
        all_rows.extend(flat)

        if len(rows) < BATCH:
            break
        offset += BATCH

    if not all_rows:
        return pd.DataFrame()

    df = pd.DataFrame(all_rows)
    print(f"Loaded {len(df):,} major requirement rows from Supabase.")
    return df


# ── Search helpers (used by /professors/search and /courses/search) ─
# These work on the in-memory DataFrame loaded at startup — no extra
# Supabase calls needed at query time.

def find_col(df: pd.DataFrame, possible_names: list[str]) -> str | None:
    for name in possible_names:
        if name in df.columns:
            return name
    lower_map = {c.lower().strip(): c for c in df.columns}
    for name in possible_names:
        hit = lower_map.get(name.lower().strip())
        if hit:
            return hit
    return None


def search_courses(df: pd.DataFrame, query: str, limit: int = 20) -> list[dict]:
    q = query.lower().strip()
    courses = df[["Subject", "Course No.", "Course Title"]].dropna().drop_duplicates().copy()
    courses["Course"] = courses["Subject"].astype(str) + " " + courses["Course No."].astype(str)
    courses["search"] = (courses["Course"] + " " + courses["Course Title"].astype(str)).str.lower()
    out = courses[courses["search"].str.contains(q, regex=False, na=False)].head(limit)
    results = []
    for _, row in out.iterrows():
        results.append({
            "label": f"{row['Course']}: {row['Course Title']}",
            "metadata": {
                "subject": str(row["Subject"]),
                "course_no": str(row["Course No."]),
                "course_title": str(row["Course Title"]),
            },
        })
    return results


def search_professors(df: pd.DataFrame, query: str, limit: int = 20) -> list[dict]:
    q = query.lower().strip()
    names = sorted(df["Instructor"].dropna().astype(str).unique())
    hits = [n for n in names if q in n.lower()][:limit]
    return [{"label": name, "metadata": {"instructor": name}} for name in hits]

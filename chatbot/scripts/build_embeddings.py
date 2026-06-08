"""
scripts/build_embeddings.py

One-time (and re-runnable) script that reads all data from Supabase,
converts it into text chunks, embeds them using Google's gemini-embedding-001
model at 384 dimensions, and upserts the vectors into the `embeddings` table.

Run from the chat-bot root:
    python -m scripts.build_embeddings

Skips chunks that are already embedded, so you can run it in daily batches
if you hit the free-tier 1000 req/day limit.

Requirements: GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_KEY in .env
"""

import os
import sys
import re as _re
import time
import json
from pathlib import Path

# Allow running from the chat-bot root without installing the package
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client
from google import genai
from google.genai import types


# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL  = os.environ["SUPABASE_URL"]
SUPABASE_KEY  = os.environ["SUPABASE_KEY"]
GOOGLE_API_KEY = os.environ["GOOGLE_API_KEY"]
EMBED_MODEL   = "gemini-embedding-001"
EMBED_DIMS    = 384          # must match vector_store.py and Supabase schema
SUPABASE_BATCH = 1000        # rows per Supabase fetch

db            = create_client(SUPABASE_URL, SUPABASE_KEY)
google_client = genai.Client(api_key=GOOGLE_API_KEY)


# ── Fetch already-embedded source_ids so we can skip them ────────────────────

def fetch_existing_ids() -> set[str]:
    """Return set of 'source_type:source_id' strings already in the table."""
    existing = set()
    offset = 0
    while True:
        result = (
            db.table("embeddings")
            .select("source_type,source_id")
            .range(offset, offset + SUPABASE_BATCH - 1)
            .execute()
        )
        rows = result.data or []
        for r in rows:
            existing.add(f"{r['source_type']}:{r['source_id']}")
        if len(rows) < SUPABASE_BATCH:
            break
        offset += SUPABASE_BATCH
    return existing


# ── Embedding helper ──────────────────────────────────────────────────────────

def embed_one(text: str) -> list[float]:
    """
    Embed via Google API at EMBED_DIMS dimensions.
    Unlimited retries on 429, 3 retries on transient errors.
    """
    transient_attempts = 0
    while True:
        try:
            response = google_client.models.embed_content(
                model=EMBED_MODEL,
                contents=text,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    output_dimensionality=EMBED_DIMS,
                ),
            )
            return response.embeddings[0].values
        except Exception as exc:
            msg = str(exc)
            if "API_KEY_INVALID" in msg or "API key not valid" in msg:
                print("\n  FATAL: Invalid Google API key.\n")
                sys.exit(1)
            if "NOT_FOUND" in msg and "404" in msg:
                print(f"\n  FATAL: {exc}\n")
                sys.exit(1)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                m = _re.search(r'retryDelay[^0-9]*(\d{1,3})s', msg, _re.IGNORECASE)
                if not m:
                    m = _re.search(r'\b(\d{1,3})s\b', msg)
                wait = min(int(m.group(1)) + 2 if m else 60, 120)
                print(f"\n    Rate limited — waiting {wait}s...", flush=True)
                time.sleep(wait)
                continue
            transient_attempts += 1
            if transient_attempts <= 3:
                print(f"\n    Error (attempt {transient_attempts}/3): {exc}")
                time.sleep(2 ** transient_attempts)
            else:
                raise


def upsert_embeddings(rows: list[dict]):
    """Upsert a list of embedding rows into Supabase."""
    db.table("embeddings").upsert(rows, on_conflict="source_type,source_id").execute()


# ── Data builders ─────────────────────────────────────────────────────────────

def fetch_all(table: str, select: str, filters: list = None) -> list[dict]:
    offset, all_rows = 0, []
    while True:
        q = db.table(table).select(select).range(offset, offset + SUPABASE_BATCH - 1)
        if filters:
            for method, *args in filters:
                q = getattr(q, method)(*args)
        result = q.execute()
        rows = result.data or []
        all_rows.extend(rows)
        if len(rows) < SUPABASE_BATCH:
            break
        offset += SUPABASE_BATCH
    return all_rows


def build_course_chunks() -> list[dict]:
    """One chunk per course: subject, title, credits, avg GPA, pathways."""
    print("  Fetching courses...")
    rows = fetch_all(
        "courses",
        "subject, course_number, title, credits, avg_gpa, pathways, total_sections",
    )
    chunks = []
    for r in rows:
        subject = r.get("subject", "")
        number  = r.get("course_number", "")
        title   = r.get("title") or f"{subject} {number}"
        credits = r.get("credits") or ""
        gpa     = f"Average GPA: {r['avg_gpa']}." if r.get("avg_gpa") else ""
        paths   = f"Pathways: {', '.join(r['pathways'])}." if r.get("pathways") else ""
        sections = f"Fall 2026 sections offered: {r['total_sections']}." if r.get("total_sections") else ""
        text = (
            f"Course {subject} {number}: {title}. "
            f"Credits: {credits}. {gpa} {paths} {sections}"
        ).strip()
        chunks.append({
            "source_type": "course",
            "source_id":   f"{subject.lower()}-{number}",
            "content":     text,
            "metadata":    json.dumps({
                "subject": subject,
                "course_number": number,
                "title": title,
            }),
        })
    return chunks


def build_grade_chunks() -> list[dict]:
    """
    One chunk per unique course+instructor combination (aggregated across terms).
    This keeps the chunk count manageable while preserving per-instructor data.
    """
    print("  Fetching grades...")
    rows = fetch_all(
        "grades",
        "subject, course_number, course_title, instructor, gpa, a_pct, f_pct, graded_enrollment",
    )

    # Aggregate across terms per course+instructor
    agg: dict[tuple, dict] = {}
    for r in rows:
        key = (r.get("subject", ""), r.get("course_number", ""), r.get("instructor") or "Staff")
        if key not in agg:
            agg[key] = {
                "subject": r.get("subject", ""),
                "course_number": r.get("course_number", ""),
                "course_title": r.get("course_title", ""),
                "instructor": r.get("instructor") or "Staff",
                "gpas": [], "a_pcts": [], "f_pcts": [], "enrollments": [],
            }
        entry = agg[key]
        if r.get("gpa") is not None:
            entry["gpas"].append(float(r["gpa"]))
        if r.get("a_pct") is not None:
            entry["a_pcts"].append(float(r["a_pct"]))
        if r.get("f_pct") is not None:
            entry["f_pcts"].append(float(r["f_pct"]))
        if r.get("graded_enrollment") is not None:
            entry["enrollments"].append(int(r["graded_enrollment"]))

    def avg(lst): return round(sum(lst) / len(lst), 2) if lst else None

    chunks = []
    for (subj, num, instr), e in agg.items():
        title = e["course_title"] or f"{subj} {num}"
        gpa   = avg(e["gpas"])
        a_pct = avg(e["a_pcts"])
        f_pct = avg(e["f_pcts"])
        enroll = avg(e["enrollments"])
        parts = [f"Grade data for {subj} {num} ({title}) taught by {instr}."]
        if gpa   is not None: parts.append(f"Average GPA: {gpa}.")
        if a_pct is not None: parts.append(f"A rate: {a_pct}%.")
        if f_pct is not None: parts.append(f"F rate: {f_pct}%.")
        if enroll is not None: parts.append(f"Average enrollment: {int(enroll)} students.")
        chunks.append({
            "source_type": "grade",
            "source_id":   f"{subj.lower()}-{num}-{instr.lower().replace(' ', '_')}",
            "content":     " ".join(parts),
            "metadata":    json.dumps({
                "subject": subj,
                "course_number": num,
                "instructor": instr,
                "avg_gpa": gpa,
            }),
        })
    return chunks


def build_requirement_chunks() -> list[dict]:
    """
    One chunk per major listing all its required courses.
    Keeps requirements for the same major in a single retrievable chunk.
    """
    print("  Fetching major requirements...")
    # Fetch directly (can't use generic fetch_all for the IS NOT NULL filter)
    offset, rows = 0, []
    while True:
        result = (
            db.table("major_requirements")
            .select("course_code, course_title, requirement_type, requirement_group, credits_min, majors(major_name, college, degree)")
            .not_.is_("course_code", "null")
            .range(offset, offset + SUPABASE_BATCH - 1)
            .execute()
        )
        batch = result.data or []
        rows.extend(batch)
        if len(batch) < SUPABASE_BATCH:
            break
        offset += SUPABASE_BATCH

    # Group by major
    by_major: dict[str, dict] = {}
    for r in rows:
        major_info = r.get("majors") or {}
        mname = major_info.get("major_name", "Unknown")
        if mname not in by_major:
            by_major[mname] = {
                "college": major_info.get("college", ""),
                "degree":  major_info.get("degree", ""),
                "courses": [],
            }
        code  = r.get("course_code", "")
        title = r.get("course_title", "")
        rtype = r.get("requirement_type", "")
        entry = code
        if title: entry += f" ({title})"
        if rtype: entry += f" [{rtype}]"
        by_major[mname]["courses"].append(entry)

    chunks = []
    for mname, info in by_major.items():
        course_list = ", ".join(info["courses"])
        text = (
            f"{mname} major ({info['degree'] or 'B.S.'}) at Virginia Tech, "
            f"{info['college']}. "
            f"Required courses: {course_list}."
        )
        chunks.append({
            "source_type": "requirement",
            "source_id":   mname.lower().replace(" ", "_").replace("/", "_"),
            "content":     text,
            "metadata":    json.dumps({
                "major_name": mname,
                "college": info["college"],
                "degree": info["degree"],
                "course_count": len(info["courses"]),
            }),
        })
    return chunks


def build_instructor_chunks() -> list[dict]:
    """One chunk per instructor with RMP and teaching history."""
    print("  Fetching instructors...")
    rows = fetch_all("instructors", "name, subjects, course_count, avg_gpa, rmp_rating, rmp_difficulty, rmp_count")
    chunks = []
    for r in rows:
        name     = r.get("name", "")
        subjects = ", ".join(r.get("subjects") or [])
        count    = r.get("course_count") or 0
        gpa      = r.get("avg_gpa")
        rmp      = r.get("rmp_rating")
        diff     = r.get("rmp_difficulty")
        rcount   = r.get("rmp_count") or 0

        parts = [f"Instructor {name} at Virginia Tech."]
        if subjects: parts.append(f"Teaches {subjects} courses.")
        if count:    parts.append(f"Has taught {count} distinct courses.")
        if gpa:      parts.append(f"Average GPA across all sections: {gpa}.")
        if rmp:      parts.append(f"RateMyProfessors rating: {rmp}/5 ({rcount} ratings).")
        if diff:     parts.append(f"RMP difficulty: {diff}/5.")

        chunks.append({
            "source_type": "instructor",
            "source_id":   name.lower().replace(" ", "_"),
            "content":     " ".join(parts),
            "metadata":    json.dumps({
                "name": name,
                "avg_gpa": gpa,
                "rmp_rating": rmp,
            }),
        })
    return chunks


# ── Main ──────────────────────────────────────────────────────────────────────

def process_source(label: str, chunks: list[dict], existing: set[str]):
    if not chunks:
        print(f"  No chunks for {label}, skipping.")
        return

    # Filter out already-embedded chunks
    pending = [
        c for c in chunks
        if f"{c['source_type']}:{c['source_id']}" not in existing
    ]
    skipped = len(chunks) - len(pending)
    if skipped:
        print(f"  Skipping {skipped:,} already-embedded {label} chunks.")
    if not pending:
        print(f"  {label}: all chunks already embedded.")
        return

    total = len(pending)
    print(f"  Embedding {total:,} {label} chunks (100 req/min free-tier limit)...")

    rows_to_upsert = []
    inserted = 0

    for i, chunk in enumerate(pending):
        vector = embed_one(chunk["content"])
        rows_to_upsert.append({
            "source_type": chunk["source_type"],
            "source_id":   chunk["source_id"],
            "content":     chunk["content"],
            "embedding":   vector,
            "metadata":    chunk["metadata"],
        })

        if len(rows_to_upsert) >= 50 or i == total - 1:
            upsert_embeddings(rows_to_upsert)
            inserted += len(rows_to_upsert)
            rows_to_upsert = []
            print(f"    {inserted:,}/{total:,} done...", end="\r", flush=True)

        # 0.65s per call ≈ 92/min, stays under the 100/min limit
        time.sleep(0.65)

    print(f"  {label}: {inserted:,} embeddings upserted.           ")


def main():
    print("=== Darvis embedding builder ===\n")

    print("Checking existing embeddings (will skip already-embedded chunks)...")
    existing = fetch_existing_ids()
    print(f"  {len(existing):,} chunks already embedded.\n")

    sources = [
        ("courses",      build_course_chunks),
        ("grades",       build_grade_chunks),
        ("requirements", build_requirement_chunks),
        ("instructors",  build_instructor_chunks),
    ]

    for label, builder in sources:
        print(f"[{label}]")
        try:
            chunks = builder()
            process_source(label, chunks, existing)
        except Exception as exc:
            print(f"  ERROR building {label}: {exc}")
        print()

    # Final count
    result = db.table("embeddings").select("source_type", count="exact").execute()
    print(f"Done. Total embeddings in Supabase: {result.count:,}")


if __name__ == "__main__":
    main()

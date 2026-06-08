"""
One-time script: generates gemini-embedding-001 embeddings for all rows in the
Supabase `grades` table and upserts them into `grade_embeddings`.

Run once from the chat-bot/ directory:

    source .venv/bin/activate
    python -m scripts.embed_grades

Re-run any time new grade rows are added — already-embedded rows are skipped.
"""

import os
import time
import math
import requests

from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY  = os.environ["GOOGLE_API_KEY"]
SUPABASE_URL    = os.environ["SUPABASE_URL"]
SUPABASE_KEY    = os.environ["SUPABASE_KEY"]

EMBEDDING_MODEL = "models/gemini-embedding-001"
EMBED_URL       = f"https://generativelanguage.googleapis.com/v1beta/{EMBEDDING_MODEL}:batchEmbedContents"
SINGLE_URL      = f"https://generativelanguage.googleapis.com/v1beta/{EMBEDDING_MODEL}:embedContent"

BATCH_SIZE      = 100   # texts per batchEmbedContents call
SUPABASE_BATCH  = 500   # rows per Supabase fetch page
UPSERT_BATCH    = 100   # records per Supabase upsert call
BATCH_DELAY_S   = 62    # seconds between batch calls — 100 texts/batch counts as ~100 RPM units


def build_content(row: dict) -> str:
    a_range = ""
    try:
        a  = float(row.get("a_pct")  or 0)
        am = float(row.get("a_minus_pct") or 0)
        a_range = f"{a + am:.1f}%"
    except (TypeError, ValueError):
        pass

    parts = [
        f"{row.get('subject', '')} {row.get('course_number', '')} {row.get('course_title', '')}".strip(),
        f"Instructor: {row.get('instructor', 'Unknown')}",
        f"{row.get('academic_year', '')} {row.get('term', '')}".strip(),
        f"GPA: {row.get('gpa', 'N/A')}",
    ]
    if a_range:
        parts.append(f"A/A-: {a_range}")
    parts.append(f"F: {row.get('f_pct', 'N/A')}%")
    parts.append(f"Enrollment: {row.get('graded_enrollment', 'N/A')}")
    return " | ".join(p for p in parts if p)


def fetch_all_grades(client) -> list[dict]:
    rows, offset = [], 0
    print("Fetching all grade rows from Supabase...")
    while True:
        result = (
            client.table("grades")
            .select("*")
            .range(offset, offset + SUPABASE_BATCH - 1)
            .execute()
        )
        batch = result.data or []
        rows.extend(batch)
        print(f"  {len(rows):,} rows fetched...")
        if len(batch) < SUPABASE_BATCH:
            break
        offset += SUPABASE_BATCH
    return rows


def fetch_already_embedded(client) -> set[int]:
    result = client.table("grade_embeddings").select("grade_id").execute()
    return {r["grade_id"] for r in (result.data or [])}


def embed_batch(texts: list[str], retries: int = 6) -> list[list[float]]:
    """
    Uses the REST batchEmbedContents endpoint directly.
    Parses Retry-After header on 429 so we wait exactly what Google asks.
    """
    payload = {
        "requests": [
            {
                "model": EMBEDDING_MODEL,
                "content": {"parts": [{"text": t}]},
                "taskType": "RETRIEVAL_DOCUMENT",
            }
            for t in texts
        ]
    }
    for attempt in range(retries):
        r = requests.post(EMBED_URL, params={"key": GOOGLE_API_KEY}, json=payload, timeout=60)
        if r.status_code == 429:
            # Respect Retry-After if present, otherwise use 65s
            retry_after = int(r.headers.get("Retry-After", 65))
            wait = max(retry_after, 65)
            print(f"    429 rate limit — waiting {wait}s (attempt {attempt + 1}/{retries})...")
            time.sleep(wait)
            continue
        r.raise_for_status()
        return [e["values"] for e in r.json()["embeddings"]]
    r.raise_for_status()


def upsert_embeddings(client, records: list[dict]):
    for i in range(0, len(records), UPSERT_BATCH):
        chunk = records[i : i + UPSERT_BATCH]
        client.table("grade_embeddings").upsert(
            chunk, on_conflict="grade_id"
        ).execute()


def main():
    supa = create_client(SUPABASE_URL, SUPABASE_KEY)

    all_grades   = fetch_all_grades(supa)
    already_done = fetch_already_embedded(supa)
    to_embed     = [r for r in all_grades if r["id"] not in already_done]

    print(f"\nTotal grade rows : {len(all_grades):,}")
    print(f"Already embedded : {len(already_done):,}")
    print(f"Need embedding   : {len(to_embed):,}")

    if not to_embed:
        print("\nAll rows already embedded. Nothing to do.")
        return

    total_batches = math.ceil(len(to_embed) / BATCH_SIZE)
    embedded      = 0

    print(f"\nEmbedding in {total_batches} batch(es) of up to {BATCH_SIZE} (~{BATCH_DELAY_S}s delay between each)...")
    for i in range(total_batches):
        batch_rows = to_embed[i * BATCH_SIZE : (i + 1) * BATCH_SIZE]
        texts      = [build_content(r) for r in batch_rows]

        embeddings = embed_batch(texts)

        records = [
            {
                "grade_id":  row["id"],
                "content":   text,
                "embedding": "[" + ",".join(str(v) for v in emb) + "]",
            }
            for row, text, emb in zip(batch_rows, texts, embeddings)
        ]

        # Upsert immediately — crash-safe, already-stored rows are skipped on re-run
        upsert_embeddings(supa, records)
        embedded += len(batch_rows)
        print(f"  Batch {i + 1}/{total_batches} done and saved — {embedded:,}/{len(to_embed):,}")

        if i < total_batches - 1:
            time.sleep(BATCH_DELAY_S)

    print(f"\nDone. {embedded:,} embeddings stored in grade_embeddings.")


if __name__ == "__main__":
    main()

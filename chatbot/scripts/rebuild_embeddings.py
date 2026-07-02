"""
scripts/rebuild_embeddings.py

Full embedding rebuild using the new DocumentChunker and EmbeddingService.

Improvements over the old build_embeddings.py:
  - Requirements are chunked by requirement_group (~10 courses/chunk)
    instead of one giant chunk per major (up to 100+ courses/chunk).
  - Grade chunks include trend signal and withdrawal data.
  - Course chunks include full grade distribution percentages.
  - Instructor chunks include their courses taught list.
  - Supports multiple embedding providers (OpenAI, Google, fastembed).
  - Progress reporting with ETA.
  - Dry-run mode (--dry-run) to preview chunks without embedding.
  - Force-rebuild mode (--force) to re-embed everything, even existing chunks.

Run from the chat-bot root:
    python -m scripts.rebuild_embeddings
    python -m scripts.rebuild_embeddings --force
    python -m scripts.rebuild_embeddings --dry-run
    python -m scripts.rebuild_embeddings --source grades    # rebuild one source only
    python -m scripts.rebuild_embeddings --wipe --force     # clean rebuild — delete all rows first

Use --wipe when source_id formats have changed (e.g. old build_embeddings.py
rows): upsert alone leaves stale rows behind as near-duplicates.

Requirements: SUPABASE_URL, SUPABASE_KEY in .env
Plus at least one: OPENAI_API_KEY (preferred), GOOGLE_API_KEY, or fastembed installed.
"""

import argparse
import json
import sys
import time
from pathlib import Path

# Allow running from chat-bot/ root without installing the package
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client
from app.config import get_settings
from app.data.loader import (
    load_from_supabase,
    load_rmp_from_supabase,
    load_courses_from_supabase,
    load_requirements_from_supabase,
)
from app.rag.chunker import DocumentChunker, Chunk
from app.rag.embedder import EmbeddingService


def fetch_existing_ids(db) -> set[str]:
    """Return set of 'source_type:source_id' strings already embedded."""
    existing: set[str] = set()
    BATCH = 1000
    offset = 0
    while True:
        result = (
            db.table("embeddings")
            .select("source_type,source_id")
            .range(offset, offset + BATCH - 1)
            .execute()
        )
        rows = result.data or []
        for r in rows:
            existing.add(f"{r['source_type']}:{r['source_id']}")
        if len(rows) < BATCH:
            break
        offset += BATCH
    return existing


def upsert_batch(db, rows: list[dict]):
    # Deduplicate by (source_type, source_id) — truncated names can collide within a batch,
    # causing "ON CONFLICT DO UPDATE command cannot affect row a second time".
    seen: dict[tuple, dict] = {}
    for row in rows:
        seen[(row["source_type"], row["source_id"])] = row
    rows = list(seen.values())
    db.table("embeddings").upsert(rows, on_conflict="source_type,source_id").execute()


def wipe_embeddings(db):
    """
    Delete ALL rows from the embeddings table so stale rows with old
    source_id formats don't survive the rebuild as duplicates.
    """
    result = db.table("embeddings").select("id", count="exact").limit(1).execute()
    before = result.count or 0
    print(f"Wiping embeddings table ({before:,} rows)...")
    # returning="minimal" avoids pulling every deleted row (with vectors) back
    # over the wire; .neq("id", -1) matches every row (ids are positive).
    db.table("embeddings").delete(returning="minimal").neq("id", -1).execute()
    print("  Embeddings table wiped.\n")


def embed_and_upsert(
    db,
    embedder: EmbeddingService,
    chunks: list[Chunk],
    existing: set[str],
    force: bool = False,
    dry_run: bool = False,
    batch_size: int = 50,
):
    """
    Embed and upsert a list of Chunk objects.
    Skips already-embedded chunks unless --force is set.
    """
    if not chunks:
        print("  No chunks to process.")
        return

    pending = chunks if force else [
        c for c in chunks
        if f"{c.source_type}:{c.source_id}" not in existing
    ]
    skipped = len(chunks) - len(pending)
    if skipped:
        print(f"  Skipping {skipped:,} already-embedded chunks.")
    if not pending:
        print("  All chunks already embedded.")
        return

    print(f"  Embedding {len(pending):,} chunks via {embedder.provider}...")

    if dry_run:
        for chunk in pending[:3]:
            print(f"    [DRY RUN] {chunk.source_type}:{chunk.source_id}")
            print(f"    Content: {chunk.content[:120]}...")
        print(f"  ... and {max(0, len(pending) - 3)} more (dry-run, not embedding)")
        return

    rows_to_upsert: list[dict] = []
    inserted = 0
    failed = 0
    start = time.time()

    for i in range(0, len(pending), batch_size):
        batch = pending[i : i + batch_size]
        texts = [c.content for c in batch]

        # delay_s=0.7 respects Google's 100 req/min free-tier limit
        delay = 0.7 if embedder.provider == "google" else 0.0
        vectors = embedder.embed_batch(texts, batch_size=batch_size, delay_s=delay)

        for chunk, vector in zip(batch, vectors):
            if vector is None:
                failed += 1
                print(f"    WARNING: embed failed for {chunk.source_id}")
                continue
            row = chunk.to_db_row()
            row["embedding"] = vector
            rows_to_upsert.append(row)

        if rows_to_upsert:
            upsert_batch(db, rows_to_upsert)
            inserted += len(rows_to_upsert)
            rows_to_upsert = []

        elapsed = time.time() - start
        rate = inserted / elapsed if elapsed > 0 else 0
        remaining = len(pending) - (i + batch_size)
        eta = remaining / rate if rate > 0 else 0
        print(
            f"  {inserted:,}/{len(pending):,} done "
            f"({failed} failed) | {rate:.1f}/s | ETA {eta:.0f}s    ",
            end="\r", flush=True,
        )

    print(f"\n  Done: {inserted:,} upserted, {failed} failed.")


def main():
    parser = argparse.ArgumentParser(description="Rebuild Darvis RAG embeddings")
    parser.add_argument("--force", action="store_true", help="Re-embed all chunks, even existing ones")
    parser.add_argument("--dry-run", action="store_true", help="Preview chunks without embedding")
    parser.add_argument(
        "--wipe", action="store_true",
        help="Delete ALL rows from the embeddings table before rebuilding "
             "(removes stale rows whose old source_id formats upsert can't overwrite)",
    )
    parser.add_argument(
        "--source",
        choices=["courses", "grades", "requirements", "instructors", "all"],
        default="all",
        help="Which source type to rebuild (default: all)",
    )
    args = parser.parse_args()

    cfg = get_settings()
    db = create_client(cfg.supabase_url, cfg.supabase_key)
    embedder = EmbeddingService(settings=cfg)

    if not embedder.available and not args.dry_run:
        print("ERROR: No embedding provider available.")
        print("Set OPENAI_API_KEY, GOOGLE_API_KEY, or install fastembed.")
        sys.exit(1)

    print(f"=== Darvis RAG Embedding Rebuild ===")
    print(f"  Provider: {embedder.provider} (dim={embedder.dim})")
    print(f"  Mode: {'DRY RUN' if args.dry_run else ('FORCE' if args.force else 'INCREMENTAL')}")
    print(f"  Source: {args.source}\n")

    if args.wipe and not args.dry_run:
        wipe_embeddings(db)

    if not args.dry_run and not args.force:
        print("Checking existing embeddings...")
        existing = fetch_existing_ids(db)
        print(f"  {len(existing):,} already embedded.\n")
    else:
        existing = set()

    print("Loading data from Supabase...")
    grades_df = load_from_supabase()
    rmp_df = load_rmp_from_supabase()
    courses_df = load_courses_from_supabase()
    requirements_df = load_requirements_from_supabase()
    print()

    sources = {
        "courses": lambda: DocumentChunker.chunk_courses(courses_df),
        "grades": lambda: DocumentChunker.chunk_grades(grades_df),
        "requirements": lambda: DocumentChunker.chunk_requirements(requirements_df),
        "instructors": lambda: DocumentChunker.chunk_instructors(rmp_df, grades_df),
    }

    targets = list(sources.keys()) if args.source == "all" else [args.source]

    for label in targets:
        print(f"[{label}]")
        try:
            chunks = sources[label]()
            print(f"  Built {len(chunks):,} chunks.")
            embed_and_upsert(
                db, embedder, chunks, existing,
                force=args.force,
                dry_run=args.dry_run,
            )
        except Exception as exc:
            import traceback
            print(f"  ERROR processing {label}: {exc}")
            traceback.print_exc()
        print()

    if not args.dry_run:
        result = db.table("embeddings").select("source_type", count="exact").execute()
        print(f"Total embeddings in Supabase: {result.count:,}")


if __name__ == "__main__":
    main()

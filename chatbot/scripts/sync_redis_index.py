"""
scripts/sync_redis_index.py

Reads the `embeddings` table from Supabase (the durable source of truth,
populated by build_embeddings.py / rebuild_embeddings.py)
and loads every row into the Redis index that app/rag/retriever.py queries
at runtime via redisvl.

Rerunnable any time:
  - after running build_embeddings.py / rebuild_embeddings.py
  - any time Redis is cold (e.g. a Redis Cloud free-tier restart/eviction)
  - after changing RAG_REDIS_INDEX_NAME

Requirements: SUPABASE_URL, SUPABASE_KEY, REDIS_URL in .env

Run from the chatbot/ root:
    python -m scripts.sync_redis_index
"""

import json
import logging
import struct
import sys
import time
from pathlib import Path

# Allow running from chatbot/ root without installing the package
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from app.config import get_settings
from app.rag.redis_schema import INDEX_NAME, build_schema

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("sync_redis_index")

_PAGE_SIZE = 1000
# Embeddings rows are large (~1.5 KB each with a 384-dim vector). Fetching
# 1,000 at a time can hit Supabase's statement timeout at scale. Use a smaller
# page size and retry on timeout before giving up.
_EMBED_PAGE_SIZE = 200
_LOAD_BATCH_SIZE = 500


def fetch_all_embeddings(supabase) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        last_err = None
        batch: list[dict] = []
        for attempt in range(3):
            try:
                resp = (
                    supabase.table("embeddings")
                    .select("id, content, source_type, source_id, metadata, embedding")
                    .order("id")
                    .range(offset, offset + _EMBED_PAGE_SIZE - 1)
                    .execute()
                )
                batch = resp.data or []
                last_err = None
                break
            except Exception as exc:
                last_err = exc
                wait = 2 ** attempt
                logger.warning("  batch at offset %d failed (attempt %d/3): %s — retrying in %ds",
                               offset, attempt + 1, exc, wait)
                time.sleep(wait)
        if last_err:
            raise RuntimeError(
                f"Supabase fetch failed at offset {offset} after 3 attempts: {last_err}"
            ) from last_err
        if not batch:
            break
        rows.extend(batch)
        offset += _EMBED_PAGE_SIZE
        logger.info("  fetched %d rows so far", len(rows))
        if len(batch) < _EMBED_PAGE_SIZE:
            break
    return rows


def _parse_embedding(raw) -> list[float]:
    if isinstance(raw, str):
        return json.loads(raw)
    return list(raw)


def _to_bytes(raw) -> bytes:
    floats = _parse_embedding(raw)
    return struct.pack(f"{len(floats)}f", *floats)


def main() -> int:
    settings = get_settings()

    if not settings.redis_url:
        logger.error("REDIS_URL is not set — add it to chatbot/.env")
        return 1
    if not settings.supabase_url or not settings.supabase_key:
        logger.error("SUPABASE_URL / SUPABASE_KEY are not set — add them to chatbot/.env")
        return 1

    from supabase import create_client
    from redisvl.index import SearchIndex
    from redisvl.schema import IndexSchema

    supabase = create_client(settings.supabase_url, settings.supabase_key)

    logger.info("Fetching embeddings from Supabase...")
    rows = fetch_all_embeddings(supabase)
    if not rows:
        logger.error("No rows found in Supabase `embeddings` table — nothing to sync. "
                      "Run build_embeddings.py / rebuild_embeddings.py first.")
        return 1

    first_emb = _parse_embedding(rows[0]["embedding"])
    dim = len(first_emb)
    index_name = settings.rag_redis_index_name or INDEX_NAME
    schema = IndexSchema.from_dict(build_schema(index_name, dim))
    index = SearchIndex(schema, redis_url=settings.redis_url)
    # Delete existing hash keys before recreating index to free memory
    import redis as _redis
    raw = _redis.from_url(settings.redis_url)
    existing_keys = raw.keys(f"{index_name}:*")
    if existing_keys:
        raw.delete(*existing_keys)
        logger.info("Deleted %d stale keys from Redis", len(existing_keys))

    index.create(overwrite=True, drop=True)
    logger.info("Created Redis index %r (dim=%d)", index_name, dim)

    docs = []
    for row in rows:
        meta = row.get("metadata") or {}
        if isinstance(meta, str):
            try:
                meta_dict = json.loads(meta)
            except Exception:
                meta_dict = {}
        else:
            meta_dict = meta
        docs.append({
            "id": row["id"],
            "source_type": row.get("source_type") or "",
            "source_id": row.get("source_id") or "",
            "subject": str(meta_dict.get("subject") or ""),
            "course_number": str(meta_dict.get("course_number") or ""),
            "content": row.get("content") or "",
            "metadata": json.dumps(meta_dict),
            "embedding": _to_bytes(row["embedding"]),
        })

    logger.info("Loading %d documents into Redis...", len(docs))
    start = time.time()
    for i in range(0, len(docs), _LOAD_BATCH_SIZE):
        batch = docs[i:i + _LOAD_BATCH_SIZE]
        index.load(batch, id_field="id")
        logger.info("  loaded %d/%d", min(i + _LOAD_BATCH_SIZE, len(docs)), len(docs))

    elapsed = time.time() - start
    logger.info("Done in %.1fs. Redis index %r now has %d documents.", elapsed, index_name, len(docs))

    # ── Embed + load sections directly (not in Supabase embeddings table) ──────
    _load_sections(supabase, index, index_name, dim)

    return 0


def _load_sections(supabase, index, index_name: str, dim: int) -> None:
    """Fetch current-term sections, chunk, embed, and load into Redis."""
    try:
        from app.rag.chunker import DocumentChunker
        from app.rag.embedder import EmbeddingService

        term = get_settings().current_term
        logger.info("Fetching sections from Supabase...")
        sections: list[dict] = []
        offset = 0
        while True:
            resp = (
                supabase.table("sections")
                .select("crn, subject, course_number, instructor, days, start_time, end_time, location, seats, enrolled, credits, term")
                .eq("term", term)
                .order("id")
                .range(offset, offset + _PAGE_SIZE - 1)
                .execute()
            )
            batch = resp.data or []
            sections.extend(batch)
            if len(batch) < _PAGE_SIZE:
                break
            offset += _PAGE_SIZE
        if not sections:
            logger.warning("No sections found for term %s — skipping section embedding", term)
            return

        chunks = DocumentChunker.chunk_sections(sections)
        if not chunks:
            return

        embedder = EmbeddingService()
        if not embedder.available:
            logger.warning("Embedder unavailable — skipping section embedding")
            return

        logger.info("Embedding %d section chunks...", len(chunks))
        vectors = embedder.embed_batch([c.content for c in chunks])

        sec_docs = []
        for i, (chunk, vec) in enumerate(zip(chunks, vectors)):
            if vec is None or len(vec) != dim:
                continue
            sec_docs.append({
                "id": -(i + 1),  # negative IDs avoid collision with embeddings table IDs
                "source_type": chunk.source_type,
                "source_id": chunk.source_id,
                "subject": chunk.metadata.get("subject") or "",
                "course_number": chunk.metadata.get("course_number") or "",
                "content": chunk.content,
                "metadata": json.dumps(chunk.metadata),
                # redisvl hash storage needs packed float32 bytes — a raw list
                # makes redis-py raise DataError and the chunk is silently lost
                "embedding": struct.pack(f"{len(vec)}f", *vec),
            })

        if sec_docs:
            index.load(sec_docs, id_field="id")
            logger.info("Loaded %d section chunks into Redis index %r", len(sec_docs), index_name)
    except Exception as exc:
        logger.error("Section embedding failed (non-fatal): %s", exc)


if __name__ == "__main__":
    sys.exit(main())

"""
app/rag/redis_schema.py

Shared redisvl index schema for the Darvis embeddings vector store.
Used by both HybridRetriever (queries the index at request time) and
scripts/sync_redis_index.py (builds/refreshes the index from the Supabase
`embeddings` table, which remains the durable source of truth).
"""

from __future__ import annotations

INDEX_NAME = "darvis_embeddings"


def build_schema(index_name: str, dim: int) -> dict:
    """Return a redisvl IndexSchema-compatible dict for the given vector dimension."""
    return {
        "index": {
            "name": index_name,
            "prefix": f"{index_name}:doc",
            "storage_type": "hash",
        },
        "fields": [
            {"name": "id", "type": "numeric"},
            {"name": "source_type", "type": "tag"},
            {"name": "source_id", "type": "tag"},
            {"name": "subject", "type": "tag"},
            {"name": "course_number", "type": "tag"},
            {"name": "content", "type": "text"},
            {"name": "metadata", "type": "text"},
            {
                "name": "embedding",
                "type": "vector",
                "attrs": {
                    "dims": dim,
                    "distance_metric": "cosine",
                    "algorithm": "hnsw",
                    "datatype": "float32",
                },
            },
        ],
    }

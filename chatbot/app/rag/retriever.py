"""
app/rag/retriever.py

Hybrid retrieval combining a redisvl-managed vector index (semantic search)
with a RediSearch full-text query (keyword search) on the same Redis index,
fused via Reciprocal Rank Fusion (RRF) in Python.

Why hybrid?
  - Vector search excels at semantic paraphrases ("which prof is brutal for
    algorithms?" -> retrieves CS 3114 grade docs by meaning).
  - Keyword search catches exact identifiers (course codes, instructor names,
    GPA values) that embeddings may dilute.
  - RRF fusion avoids score normalization issues between the two systems.

The index itself is built by scripts/sync_redis_index.py from the Supabase
`embeddings` table (the durable source of truth) — this module only queries
it. Redis is a hot serving layer, not the system of record.

Flow:
  embed(query) -> vector KNN query \
                                      -> RRF fuse -> list[RetrievalResult]
  query text   -> RediSearch FT query /
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

logger = logging.getLogger("darvis.retriever")

_RRF_K = 60  # standard Reciprocal Rank Fusion smoothing constant


@dataclass
class RetrievalResult:
    """A single retrieved document chunk with retrieval metadata."""
    id: int
    content: str
    source_type: str          # "course" | "grade" | "requirement" | "instructor"
    source_id: str
    metadata: dict
    vector_score: float = 0.0
    keyword_score: float = 0.0
    combined_score: float = 0.0
    rerank_score: float | None = None


class HybridRetriever:
    """
    Executes hybrid (vector + keyword) retrieval against the Redis index
    built by scripts/sync_redis_index.py.

    Falls back gracefully:
      - If the Redis index is unreachable/missing -> empty list (vector_store.py
        then uses its own pandas keyword fallback)
      - If semantic search is unavailable -> keyword-only search
      - If keyword search is unavailable -> vector-only search
      - Never raises.
    """

    def __init__(self, redis_url: str, embedder, settings=None):
        from app.config import get_settings
        from app.rag.redis_schema import INDEX_NAME, build_schema

        cfg = settings or get_settings()
        self._embedder = embedder
        self._alpha: float = getattr(cfg, "rag_vector_weight", 0.7)
        self._top_k: int = getattr(cfg, "rag_top_k_retrieve", 20)
        self._min_similarity: float = getattr(cfg, "rag_min_similarity", 0.2)
        self._index_name: str = getattr(cfg, "rag_redis_index_name", INDEX_NAME)
        self._semantic_ready: bool = False
        self._fts_ready: bool = False
        self._embedding_count: int = 0
        self._index = None
        self._redis = None

        if not redis_url:
            logger.warning("[retriever] No REDIS_URL configured — retrieval disabled")
            return

        try:
            from redisvl.index import SearchIndex
            from redisvl.schema import IndexSchema

            schema = IndexSchema.from_dict(build_schema(self._index_name, self._embedder.dim))
            self._index = SearchIndex(schema, redis_url=redis_url)
            self._redis = self._index.client
            self._check_readiness()
        except Exception as exc:
            logger.error("[retriever] Redis index init failed: %s", exc)
            self._index = None
            self._redis = None

    def _check_readiness(self):
        """Probe Redis to see which retrieval modes are available."""
        try:
            info = self._index.info()
            self._embedding_count = int(info.get("num_docs", 0))
            self._semantic_ready = self._embedding_count > 0 and self._embedder.available
            self._fts_ready = self._embedding_count > 0
            logger.info(
                "[retriever] Ready — %d vectors in %r, semantic=%s, fts=%s",
                self._embedding_count, self._index_name, self._semantic_ready, self._fts_ready,
            )
        except Exception as exc:
            logger.error(
                "[retriever] readiness check failed (index %r may not exist yet — "
                "run scripts/sync_redis_index.py): %s",
                self._index_name, exc,
            )
            self._embedding_count = 0

    @property
    def semantic_ready(self) -> bool:
        return self._semantic_ready

    @property
    def fts_ready(self) -> bool:
        return self._fts_ready

    def embedding_count(self) -> int:
        """Total number of embedded chunks in the Redis index (used by /health)."""
        return self._embedding_count

    def retrieve(
        self,
        query: str,
        top_k: int | None = None,
        source_filter: str | None = None,
        alpha: float | None = None,
        entity_filter: dict | None = None,
    ) -> list[RetrievalResult]:
        """
        Main retrieval entry point. Uses hybrid search when possible,
        degrades to vector-only or keyword-only as needed.

        Args:
            query: The (possibly rewritten) user question.
            top_k: Override the default candidate count.
            source_filter: Restrict to a source type ("course", "grade", etc.)
            alpha: Vector weight override (0.0=keyword-only, 1.0=vector-only).
            entity_filter: Narrow by indexed entity fields, e.g.
                {"subject": "ECE", "course_number": "2004"}.
                Applied as additional Tag filters on top of source_filter.
        """
        if self._index is None:
            return []

        k = top_k or self._top_k
        a = alpha if alpha is not None else self._alpha

        if self._semantic_ready and self._fts_ready:
            return self._hybrid(query, k, a, source_filter, entity_filter)
        if self._semantic_ready:
            return self._vector_only(query, k, source_filter, entity_filter)
        if self._fts_ready:
            return self._keyword_only(query, k, source_filter, entity_filter)

        logger.warning("[retriever] No retrieval mode available — returning empty")
        return []

    # ── Retrieval implementations ──────────────────────────────────────────────

    def _hybrid(
        self,
        query: str,
        top_k: int,
        alpha: float,
        source_filter: str | None,
        entity_filter: dict | None = None,
    ) -> list[RetrievalResult]:
        """Vector KNN + RediSearch FT query, fused via RRF."""
        vec_results = self._vector_only(query, top_k, source_filter, entity_filter)
        kw_results = self._keyword_only(query, top_k, source_filter, entity_filter)

        if not vec_results and not kw_results:
            return []
        if not vec_results:
            return kw_results[:top_k]
        if not kw_results:
            return vec_results[:top_k]
        return self._rrf_fuse(vec_results, kw_results, alpha, top_k)

    def _rrf_fuse(
        self,
        vec_results: list[RetrievalResult],
        kw_results: list[RetrievalResult],
        alpha: float,
        top_k: int,
    ) -> list[RetrievalResult]:
        """Reciprocal Rank Fusion — avoids normalizing cosine vs. BM25 scores directly."""
        scores: dict[int, float] = {}
        by_id: dict[int, RetrievalResult] = {}

        for rank, r in enumerate(vec_results):
            scores[r.id] = scores.get(r.id, 0.0) + alpha * (1.0 / (_RRF_K + rank + 1))
            by_id[r.id] = r

        for rank, r in enumerate(kw_results):
            scores[r.id] = scores.get(r.id, 0.0) + (1 - alpha) * (1.0 / (_RRF_K + rank + 1))
            if r.id in by_id:
                by_id[r.id].keyword_score = r.keyword_score
            else:
                by_id[r.id] = r

        for rid, s in scores.items():
            by_id[rid].combined_score = s

        ranked = sorted(by_id.values(), key=lambda r: r.combined_score, reverse=True)
        return ranked[:top_k]

    def _vector_only(
        self,
        query: str,
        top_k: int,
        source_filter: str | None,
        entity_filter: dict | None = None,
    ) -> list[RetrievalResult]:
        """Vector KNN search via redisvl's VectorQuery."""
        vector = self._embedder.embed(query)
        if vector is None:
            logger.warning("[retriever] Embedding failed, falling back to keyword-only")
            return self._keyword_only(query, top_k, source_filter, entity_filter)

        try:
            from redisvl.query import VectorQuery
            from redisvl.query.filter import Tag

            filter_expression = Tag("source_type") == source_filter if source_filter else None
            if entity_filter:
                for field_name, value in entity_filter.items():
                    if value:
                        tag_f = Tag(field_name) == value
                        filter_expression = (filter_expression & tag_f) if filter_expression else tag_f
            vq = VectorQuery(
                vector=vector,
                vector_field_name="embedding",
                return_fields=["id", "content", "source_type", "source_id", "metadata"],
                num_results=top_k,
                filter_expression=filter_expression,
            )
            rows = self._index.query(vq)
        except Exception as exc:
            logger.error("[retriever] vector query failed: %s", exc)
            return []

        results = []
        for row in rows:
            distance = float(row.get("vector_distance", 1.0))
            similarity = max(0.0, 1.0 - distance)
            if similarity < self._min_similarity:
                continue
            results.append(self._row_to_result(row, vector_score=similarity, combined_score=similarity))
        return results

    def _keyword_only(
        self,
        query: str,
        top_k: int,
        source_filter: str | None,
        entity_filter: dict | None = None,
    ) -> list[RetrievalResult]:
        """
        RediSearch full-text query (BM25-style scoring) on the same index.
        Falls back to a fuzzy (typo-tolerant) query when the exact match
        returns nothing — mirrors the old trigram fallback for vague queries.
        """
        if self._redis is None:
            return []

        terms = self._tokenize(query)
        if not terms:
            return []

        results = self._run_fts(terms, top_k, source_filter, fuzzy=False, entity_filter=entity_filter)
        if not results:
            results = self._run_fts(terms, top_k, source_filter, fuzzy=True, entity_filter=entity_filter)
        return results

    def _run_fts(
        self,
        terms: list[str],
        top_k: int,
        source_filter: str | None,
        fuzzy: bool,
        entity_filter: dict | None = None,
    ) -> list[RetrievalResult]:
        try:
            from redis.commands.search.query import Query as FTQuery

            pattern = "|".join(f"%{t}%" if fuzzy else t for t in terms)
            ft_q = f"@content:({pattern})"
            if source_filter:
                ft_q = f"@source_type:{{{source_filter}}} {ft_q}"
            if entity_filter:
                for field_name, value in entity_filter.items():
                    if value:
                        ft_q = f"@{field_name}:{{{value}}} {ft_q}"

            q = FTQuery(ft_q).with_scores().paging(0, top_k)
            res = self._redis.ft(self._index_name).search(q)

            results = []
            for doc in res.docs:
                meta = self._parse_metadata(getattr(doc, "metadata", "{}"))
                doc_id = int(getattr(doc, "id_", 0) or 0)
                results.append(RetrievalResult(
                    id=doc_id,
                    content=getattr(doc, "content", ""),
                    source_type=getattr(doc, "source_type", ""),
                    source_id=getattr(doc, "source_id", ""),
                    metadata=meta,
                    keyword_score=float(getattr(doc, "score", 0.0)),
                    combined_score=float(getattr(doc, "score", 0.0)),
                ))
            return results
        except Exception as exc:
            logger.debug("[retriever] FTS query failed (fuzzy=%s): %s", fuzzy, exc)
            return []

    # ── Helpers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _tokenize(query: str) -> list[str]:
        """Strip RediSearch query-syntax special characters, return plain word tokens."""
        cleaned = re.sub(r"[^\w\s]", " ", query)
        return [t for t in cleaned.split() if len(t) >= 2]

    @staticmethod
    def _parse_metadata(raw) -> dict:
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str) and raw:
            try:
                return json.loads(raw)
            except Exception:
                return {}
        return {}

    def _row_to_result(
        self,
        row: dict,
        vector_score: float = 0.0,
        combined_score: float = 0.0,
    ) -> RetrievalResult:
        return RetrievalResult(
            id=int(row.get("id", 0) or 0),
            content=str(row.get("content", "")),
            source_type=str(row.get("source_type", "")),
            source_id=str(row.get("source_id", "")),
            metadata=self._parse_metadata(row.get("metadata", "{}")),
            vector_score=vector_score,
            combined_score=combined_score,
        )

    def format_context(self, results: list[RetrievalResult]) -> str:
        """
        Format retrieved chunks into a single context string for the LLM.

        Each chunk is prefixed with a header that includes the source type AND
        the key entity from metadata (course code, instructor name, major name)
        so the LLM knows exactly what data it's reading when generating citations.
        """
        if not results:
            return ""

        parts = []
        for r in results:
            header = self._chunk_header(r)
            parts.append(f"[{header}]\n{r.content}")
        return "\n\n".join(parts)

    @staticmethod
    def _chunk_header(r: "RetrievalResult") -> str:
        """Build a context header like 'Grade data — CS 3114, Hamouda'."""
        label = {
            "grade": "Grade data",
            "course": "Course catalog",
            "requirement": "Major requirements",
            "instructor": "Instructor profile",
            "section": "Fall 2026 section",
        }.get(r.source_type, "Context")

        meta = r.metadata or {}
        entity_parts: list[str] = []

        if r.source_type == "grade":
            subj = meta.get("subject", "")
            num  = meta.get("course_number", "")
            instr = meta.get("instructor", "")
            if subj and num:
                entity_parts.append(f"{subj} {num}")
            if instr and instr.lower() != "staff":
                entity_parts.append(instr)

        elif r.source_type == "course":
            subj = meta.get("subject", "")
            num  = meta.get("course_number", "")
            if subj and num:
                entity_parts.append(f"{subj} {num}")

        elif r.source_type == "requirement":
            major = meta.get("major_name", "")
            rtype = meta.get("requirement_type", "")
            if major:
                entity_parts.append(major)
            if rtype:
                entity_parts.append(rtype)

        elif r.source_type == "instructor":
            name = meta.get("name", "")
            if name:
                entity_parts.append(name)

        elif r.source_type == "section":
            subj = meta.get("subject", "")
            num  = meta.get("course_number", "")
            instr = meta.get("instructor", "")
            if subj and num:
                entity_parts.append(f"{subj} {num}")
            if instr and instr.lower() != "staff":
                entity_parts.append(instr)

        if entity_parts:
            return f"{label} — {', '.join(entity_parts)}"
        return label

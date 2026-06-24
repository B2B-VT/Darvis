# Darvis RAG Architecture

## Request Flow

```
POST /chat
  │
  ├─ normalize_question()          guardrails.py   — typo fix, subject expansion
  │
  ├─ IntentExtractor.extract()     intent_extractor.py
  │   ├─ Gemma (bounded: 5 s)     structured JSON → ChatIntent
  │   └─ keyword fallback          router.py + detect_natural_params()
  │
  ├─ EntityResolver                entity_resolver.py
  │   ├─ resolve_professor()       fuzzy last-name match vs. grades DataFrame
  │   └─ resolve_course_code()     catalog lookup, normalise case
  │
  ├─ Route dispatch                main.py
  │   ├─ course_profile            → Pandas analytics → LLM answer
  │   ├─ professor_profile         → Pandas analytics + RMP → LLM answer
  │   ├─ natural_filter            → Pandas analytics → LLM answer
  │   ├─ major_requirements        → requirements DataFrame → LLM answer
  │   ├─ schedule_builder          → live Supabase sections query
  │   └─ general_rag               → AgenticRAGPipeline → LLM answer
  │
  └─ ChatResponse                  answer, tables, charts, warnings, route
```

## AgenticRAGPipeline (general_rag route)

```
question
  │
  QueryPlannerAgent.plan()         planner.py
  │  ├─ source_filter              "grade" | "course" | "requirement" | None
  │  ├─ alpha                      vector/keyword weight
  │  └─ primary_query              = question (attempt 0)
  │
  RAGPipeline.retrieve_full()      pipeline.py
  │  ├─ QueryRewriter              LLM expand (3 s timeout) or rule-based
  │  ├─ EmbeddingService.embed()   openai / google / fastembed
  │  ├─ HybridRetriever.retrieve() Redis: redisvl vector KNN + RediSearch FT, fused via RRF
  │  └─ Reranker.rerank()          Cohere / cross-encoder / passthrough
  │
  RetrievalCriticAgent.evaluate()  critic.py
  │  ├─ ACCEPT                     → return context string
  │  ├─ RETRY (max 2)              → replan with semantic variant query
  │  │     planner.replan()
  │  │       variant 1: entity-focused  "CS 3114 Hamouda grade F rate"
  │  │       variant 2: topic-expanded  "algorithms difficulty low GPA"
  │  │     retrieve_full(plan.primary_query)   ← uses variant, not raw question
  │  │     evaluate again
  │  └─ borderline on last attempt → LLM judge (Gemma): does context answer
  │        the question?
  │        ├─ YES                  → ACCEPT, return context
  │        ├─ NO                   → FAIL, return "" (no weak context used)
  │        └─ judge unavailable    → ACCEPT "best available" (old behavior)
  │
  GemmaAnswerClient.answer()       gemma_client.py (30 s HTTP timeout)
  │  ├─ context non-empty          → answer grounded in retrieved context
  │  └─ context == ""              → answer from Gemma's own knowledge
  │                                   (general_chat.py already branches on
  │                                   this — no special-casing needed)
  └─ SYSTEM_GUARDRAIL               advisor tone, no fabricated numbers
```

## LLM-judgement fallback

The retrieval critic (`agents/critic.py`) scores every attempt with cheap
heuristics (top score, candidate count, entity coverage). On the **last**
attempt, a borderline score used to be auto-accepted as "best available" —
even when the context didn't actually address the question, which could
produce an answer grounded in irrelevant grade data.

Now the critic asks Gemma directly (`GemmaAnswerClient.judge_relevance()`):
*"Does this retrieved context answer the question? YES or NO."* This is the
one explicit LLM-judgement call in the pipeline (mirrors Anthropic's
"RAG with LLM judgement" pattern, with Gemma standing in for Claude as the
judge). It only fires on the borderline band on the final attempt — clear
hits (`ACCEPT` immediately) and clear misses (`RETRY`/`FAIL` with no results)
never pay for the extra call. A missing/disabled/failed judge call falls back
to the old heuristic-only behavior, so a broken LLM never blocks an otherwise
healthy RAG path.

Toggle with `RAG_ENABLE_LLM_JUDGE` (default `true`).

## Component Status at Startup

`GET /health` → `rag` key shows each component's live provider:

```json
{
  "embedding_provider": "fastembed",
  "embedding_dim": 384,
  "vector_backend": "redis",
  "semantic_ready": true,
  "fts_ready": true,
  "reranker": "passthrough",
  "query_rewrite": true,
  "agentic": true,
  "max_attempts": 3
}
```

## Key Env Vars

| Var | Default | Effect |
|-----|---------|--------|
| `REDIS_URL` | `""` | Redis Stack / Redis Cloud connection string. Needed for any semantic or keyword retrieval — without it the pipeline falls straight to the pandas keyword fallback in `vector_store.py` |
| `RAG_REDIS_INDEX_NAME` | `darvis_embeddings` | Name of the redisvl index queried at runtime and (re)built by `scripts/sync_redis_index.py` |
| `RAG_ENABLE_LLM_JUDGE` | `true` | Ask Gemma whether borderline retrieved context actually answers the question before using it |
| `RAG_EMBEDDING_PROVIDER` | `""` (auto) | `openai` / `google` / `local` — **must match stored vectors** |
| `RAG_EMBEDDING_DIM` | `384` | Must match the Redis index vector dimension (and the Supabase `embeddings.embedding` column it's synced from) |
| `COHERE_API_KEY` | — | Enables Cohere Rerank (free 1k calls/month) |
| `RAG_ENABLE_LOCAL_RERANKER` | `false` | Load cross-encoder locally (~85 MB) |
| `RAG_INTENT_TIMEOUT_S` | `5.0` | Hard cap on intent extraction LLM call |
| `RAG_REWRITE_TIMEOUT_S` | `3.0` | Hard cap on query-rewrite LLM call |
| `RAG_TOP_K_RETRIEVE` | `20` | Candidates before reranking |
| `RAG_TOP_K_RERANK` | `5` | Chunks sent to LLM |
| `RAG_SKIP_EMBEDDING_VALIDATION` | `false` | Bypass startup dim check |

## Fallback Chain

Each layer degrades gracefully so the API never returns 500 on an infra failure:

```
Intent:      LLM (5 s) → keyword router
Rewrite:     LLM (3 s) → rule-based expansion → passthrough
Embedding:   OpenAI → Google → fastembed → None (semantic disabled)
Retrieval:   Redis hybrid (vector+FTS via RRF) → vector-only → FTS-only
             (with fuzzy retry) → pandas keyword fallback (vector_store.py)
Judgement:   LLM judge (borderline cases only) → heuristic-only "best available"
Reranking:   Cohere → cross-encoder (if enabled) → passthrough
Answer:      LLM → templated_answers.py
```

## Vector Store: Redis (redisvl) + Supabase

**Supabase `embeddings` is the durable source of truth.** Redis is a hot
serving index for retrieval only — it can be wiped and rebuilt at any time.

```
build_embeddings.py / rebuild_embeddings.py / embed_grades.py
  → writes rows to Supabase `embeddings` (id, content, source_type,
    source_id, metadata, embedding)
       │
       ▼
scripts/sync_redis_index.py
  → reads all rows from Supabase, (re)creates the redisvl index, loads
    every row into Redis as a hash document
       │
       ▼
app/rag/retriever.py (HybridRetriever)
  → queries the Redis index at runtime: redisvl VectorQuery for semantic
    search, RediSearch FT.SEARCH for keyword search, fused via RRF
```

Run `python -m scripts.sync_redis_index` after any embedding rebuild, and any
time Redis comes up cold (e.g. a Redis Cloud free-tier eviction/restart —
free tier has no durability guarantee, which is exactly why Supabase, not
Redis, is the source of truth).

## Embedding Consistency

The stored vectors were built with a specific provider and dimension. If
`RAG_EMBEDDING_PROVIDER` or `RAG_EMBEDDING_DIM` don't match at runtime,
cosine scores will be meaningless (near-zero). Check `/health` →
`rag.embedding_provider` to confirm the live provider matches what built
your embeddings.

To rebuild after changing providers:
```bash
python -m scripts.rebuild_embeddings
python -m scripts.sync_redis_index    # push the rebuilt vectors into Redis
```
Then update `RAG_EMBEDDING_PROVIDER` and `RAG_EMBEDDING_DIM` in Render env vars and redeploy.

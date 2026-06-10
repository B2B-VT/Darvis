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
  │  ├─ HybridRetriever.retrieve() pgvector + FTS via RRF
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
  │  └─ FAIL                       → return best-effort context
  │
  GemmaAnswerClient.answer()       gemma_client.py (30 s HTTP timeout)
  └─ SYSTEM_GUARDRAIL              advisor tone, no fabricated numbers
```

## Component Status at Startup

`GET /health` → `rag` key shows each component's live provider:

```json
{
  "embedding_provider": "fastembed",
  "embedding_dim": 384,
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
| `RAG_EMBEDDING_PROVIDER` | `""` (auto) | `openai` / `google` / `local` — **must match stored vectors** |
| `RAG_EMBEDDING_DIM` | `384` | Must match Supabase `embedding` column dimension |
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
Retrieval:   hybrid → vector-only → FTS-only → trigram → keyword fallback
Reranking:   Cohere → cross-encoder (if enabled) → passthrough
Answer:      LLM → templated_answers.py
```

## Embedding Consistency

The stored vectors in Supabase were built with a specific provider and dimension.
If `RAG_EMBEDDING_PROVIDER` or `RAG_EMBEDDING_DIM` don't match at runtime, cosine
scores will be meaningless (near-zero). Check `/health` → `rag.embedding_provider`
to confirm the live provider matches what built your embeddings.

To rebuild after changing providers:
```bash
python -m scripts.rebuild_embeddings
```
Then update `RAG_EMBEDDING_PROVIDER` and `RAG_EMBEDDING_DIM` in Render env vars and redeploy.

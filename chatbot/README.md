# Darvis — Chatbot backend

FastAPI backend powering the Darvis AI chatbot. Deployed on Render at the `/chat` endpoint. Loads all data from Supabase at startup into Pandas DataFrames, extracts structured intent from each question with an LLM (keyword router as fallback), routes to a specialized handler, and returns structured JSON.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

**Required env vars:**
```
ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
SUPABASE_URL=https://rpmgcurhxrgtzbdixtay.supabase.co
SUPABASE_KEY=your_service_role_key
REDIS_URL=redis://default:password@host:port   # Redis Stack / Redis Cloud — needed for semantic search
ALLOWED_ORIGINS=https://darvis.tech,http://localhost:3000
```

After the embeddings table is populated in Supabase, push it into Redis with:
```bash
python -m scripts.sync_redis_index
```

Set `SHOW_DOCS=true` locally to enable `/docs` (disabled in production).

## Run

```bash
source .venv/bin/activate
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

## Deploy

Push to main — Render auto-deploys. Render free tier sleeps after inactivity; first request takes ~30 seconds cold start. Upgrade to Render Starter ($7/month) to fix this.

## Architecture

```
app/
├── main.py                 FastAPI app factory, lifespan loader, intent+entity wiring, route handlers
├── config.py               Pydantic settings (reads from .env)
├── models.py               ChatRequest, ChatResponse, TableSpec, ChartSpec, SearchItem
├── data/
│   ├── loader.py           Supabase batch fetchers — grades, RMP/instructors, courses, requirements, Fall 2026 sections
│   ├── analytics.py        Core Pandas logic — course_profile, professor_profile, natural_filter
│   └── recency.py          Recency weighting (recent semesters weighted higher)
├── features/
│   ├── router.py           Keyword router — fallback when LLM intent extraction is unavailable
│   ├── course_profile.py   "CS 3114" style questions
│   ├── professor_profile.py "Hamouda" style questions
│   ├── natural_filter.py   Filter/ranking questions ("highest GPA", "worst F rate")
│   ├── general_chat.py     Catch-all — tries natural_filter, then LLM fallback
│   ├── major_requirements.py "What do I need to graduate with CS?" questions
│   ├── schedule_builder.py "Build me a schedule" requests
│   ├── section_lookup.py   "Who is teaching CS 1114?" timetable questions — startup-loaded sections_df, live Supabase fallback
│   └── templated_answers.py Template fallbacks when LLM is unavailable or quota'd
├── rag/
│   ├── gemma_client.py     Anthropic Claude Haiku client (legacy filename; 30s timeout, judge_relevance() for LLM-judgement fallback)
│   ├── intent_extractor.py LLM intent extraction (primary router) + keyword fallback
│   ├── query_rewriter.py   LLM query rewriting for retrieval
│   ├── retriever.py        Hybrid retrieval against Redis (redisvl vector + RediSearch FT, fused via RRF)
│   ├── redis_schema.py     Shared redisvl index schema (retriever + sync_redis_index.py)
│   ├── reranker.py         Reranks retrieved candidates
│   ├── chunker.py          Splits source rows into embeddable chunks
│   ├── embedder.py         Multi-provider embedding wrapper (OpenAI → fastembed local)
│   ├── pipeline.py         RAG retrieval pipeline orchestration
│   ├── agentic_pipeline.py Planner → retrieve → critic agentic flow
│   ├── agents/             planner.py (plans retrieval) + critic.py (validates answer, LLM-judgement fallback)
│   ├── observability.py    Per-stage timing + debug telemetry
│   ├── prompts.py          System prompt reference + build_answer_prompt
│   └── vector_store.py     Keyword fallback + Redis-backed semantic search
├── safety/
│   ├── guardrails.py       SYSTEM_GUARDRAIL prompt, normalize_question (whitespace/quote cleanup — LLM handles typos), answer sanitization
│   ├── entity_resolver.py  Fuzzy-matches professor names + course codes after intent extraction
│   └── privacy.py          PII detection in incoming questions
└── utils/
    └── charts.py           table_spec, bar_chart, scatter_chart JSON helpers
```

## API

### POST /chat

```json
{
  "question": "Which CS 3114 professor has the best outcomes?",
  "use_recency": true,
  "min_students": 30,
  "top_n": 10,
  "user_profile": {
    "major": "Computer Science",
    "coursesTaken": ["CS 2114", "CS 2505"]
  },
  "history": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
}
```

Response:
```json
{
  "answer": "Hamouda has the strongest grade outcomes for CS 3114...",
  "route": "course_profile",
  "warnings": ["Grade distributions do not fully measure teaching quality..."],
  "tables": [...],
  "charts": [...],
  "metadata": {},
  "schedule_actions": []
}
```

### GET /courses/search?query=cs+3114&limit=20

### GET /professors/search?query=hamouda&limit=20

### GET /health

Returns loaded row counts (grades, instructors, sections, courses, requirements) and vector store size.

### POST /feedback

Logs a thumbs up (`rating: 1`) or thumbs down (`rating: -1`) for an answer. Body: `question`, `answer`, `route`, `rating`. Writes to the `feedback` table; returns 204. Rate limit 30/min per IP.

### POST /retrieval/debug

Runs the full retrieval pipeline for a question and returns candidate chunks, vector/keyword/combined scores, rerank results, and per-stage timing — for tuning retrieval without the full chat flow. Rate limit 30/min per IP.

## Routes

| Route string | Triggered by | Handler |
|---|---|---|
| `course_profile` | Specific course code in question | `course_profile.py` |
| `professor_profile` | Professor name or "professor" keyword | `professor_profile.py` |
| `natural_filter` | Ranking/filtering language ("highest GPA", "worst F rate") | `natural_filter.py` |
| `major_requirements` | Graduation/degree requirement questions | `major_requirements.py` |
| `schedule_builder` | "Build me a schedule" requests | `schedule_builder.py` |
| `section_lookup` | Timetable phrasing ("who is teaching CS 3114 this semester", times/days/seats/location); also forced by a keyword override in main.py | `section_lookup.py` |
| `out_of_scope` | OUT_OF_SCOPE_TERMS match (currently empty — disabled) | Canned response |
| `general_rag` | Everything else | `general_chat.py` |

## LLM behavior

- Model: Claude Haiku via Anthropic (`claude-haiku-4-5-20251001`, set with `ANTHROPIC_MODEL`)
- Temperature: 0.2
- Max output tokens: 800
- Timeout: 30 seconds on the Anthropic client
- The client class/file keep their legacy names (`GemmaAnswerClient` in `rag/gemma_client.py`) from the pre-migration Gemma era
- On any failure (timeout, 429, safety block, empty output): falls back to template answer from `templated_answers.py`
- Tone: advisor-style — lead with the practical insight, support with numbers. Never open with "Based on historical grade data..."

## Semantic search

Retrieval runs against a Redis index built with [redisvl](https://github.com/redis/redis-vl-python) — vector KNN for semantic search plus a RediSearch full-text query for keyword search, fused via RRF (`app/rag/retriever.py`). Supabase `embeddings` (4,576 rows) stays the durable source of truth; `python -m scripts.sync_redis_index` reads it and (re)builds the Redis index. Without `REDIS_URL` set, the pipeline falls back to the pandas keyword search in `vector_store.py`. Note: the current 4,576 embeddings were built 2026-05-23, before the full UDC import (59,790 grade rows / 6,589 courses / 3,834 instructors) — rerun `python -m scripts.rebuild_embeddings --wipe` + `python -m scripts.sync_redis_index` to cover current data (~30.8k chunks).

A retrieval critic (`agents/critic.py`) scores every attempt; on a borderline last attempt it asks Claude Haiku directly whether the retrieved context answers the question (`RAG_ENABLE_LLM_JUDGE`, default on) before using it — clear hits/misses skip this extra call entirely. See `RAG_ARCHITECTURE.md` for the full flow.

`grade_embeddings` is a separate dead table with 0 rows — ignore it.

## Known issues and pending work

1. **Embeddings are stale** — all 4,576 `embeddings` rows date to 2026-05-23, built against pre-import data. Rerun `python -m scripts.rebuild_embeddings --wipe` then `python -m scripts.sync_redis_index` (~30.8k chunks) to cover the full grades/courses/instructors tables.
2. **Feedback UI not wired up** — the `POST /feedback` endpoint exists and writes to the `feedback` table, but the frontend thumbs up/down UI still needs to be connected to it.
3. **`courses.avg_gpa` partially null** — 5,468/6,589 courses populated; 1,121 remain null where no grade data maps.
4. **`rmp_tags` empty** — RMP's GraphQL API doesn't return `teacherRatingTags`. Confirmed via `fetch_rmp_tags.js`. Accepted limitation; ratings and difficulty are populated and working.
5. **Two professor tables** — `instructors` (3,834 rows, 1,982 with RMP ratings) is read by both the frontend `api.js` and the chatbot. The legacy `professors` table (65 rows) is only written by `backend/scripts/import_rmp.js`, never read. Resolve when convenient.

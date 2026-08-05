# Darvis chatbot — Claude Code context

FastAPI chatbot backend for darvis.tech. Deployed on Render. Loads all data from Supabase at startup, plans each question with `QueryPlanner` (primarily LLM-driven, but falls through to a real ~130-line deterministic keyword/regex router — `_deterministic_fallback_plan()` — on low confidence/LLM failure before ever returning a bare clarification request), runs Pandas analytics, and returns structured JSON with an LLM-generated or templated answer. The real request pipeline (`_run_chat_pipeline()` in `main.py`, ~450 lines) has more gates than this one-liner implies — see Request flow below.

## Run locally

```bash
source .venv/bin/activate
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

If port 8000 is in use: `lsof -ti:8000 | xargs kill -9`

## Deploy

```bash
git push    # Render auto-deploys from main
```

Render free tier sleeps after inactivity — first request takes ~30 seconds. Upgrade to Render Starter ($7/month) to fix.

## Env vars (chatbot/.env)

```
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b
SUPABASE_URL=https://rpmgcurhxrgtzbdixtay.supabase.co
SUPABASE_KEY=...           # service role key
REDIS_URL=...              # Redis Stack / Redis Cloud — semantic + keyword search
RAG_REDIS_INDEX_NAME=darvis_embeddings
RAG_ENABLE_LLM_JUDGE=true  # LLM judges borderline retrieval quality before using it
CURRENT_TERM=202609        # optional — current term code (also CURRENT_TERM_LABEL="Fall 2026")
ALLOWED_ORIGINS=https://darvis.tech,http://localhost:3000
SHOW_DOCS=true             # local only — enables /docs
```

Run `python -m scripts.sync_redis_index` after seeding/rebuilding Supabase `embeddings`, or any time Redis comes up cold — it reads Supabase and (re)builds the Redis index that retrieval actually queries.

`.env.example` actually defines ~40 vars, not just the ones above — the rest are the Cyrus/OpenAI generation-routing and local-reranker groups (`OPENAI_API_KEY`, `OPENAI_LUNA_MODEL`/`OPENAI_TERRA_MODEL`/`OPENAI_SOL_MODEL` + reasoning-effort fields, `CYRUS_DEFAULT_MODEL_TIER`, `CYRUS_MODEL_ROUTING_ENABLED` (default `false`), `CYRUS_MODEL_ESCALATION_ENABLED`, `CYRUS_MODEL_MAX_ESCALATIONS`, `RAG_ENABLE_LOCAL_RERANKER`, `RAG_TOP_K_RERANK`, `RAG_RERANK_BATCH_SIZE`, etc., plus `RAG_DEBUG_MODE` and `DEV_FEEDBACK_TOKEN` — see `app/config.py` and `.env.example` for the full set).

## File map

```
app/
├── main.py                 App factory, lifespan loader, STATE global (the real DI container), all 10 routes, _run_chat_pipeline()
├── config.py               Pydantic settings from env (~40 vars total — see Env vars note above)
├── models.py               ChatRequest, ChatResponse, ChatMessage, TableSpec, ChartSpec, SearchItem, FeedbackRequest
├── generation/              NOT imported by main.py — inert unless CYRUS_MODEL_ROUTING_ENABLED=true (default false)
│   ├── model_router.py     Deterministic Luna/Terra/Sol tier router (cost-first)
│   ├── model_types.py      ModelTier enum (LUNA/TERRA/SOL)
│   ├── providers.py        Per-tier OpenAI pricing table
│   ├── structured_generator.py  Tiered generation entry point — currently eval-only, not wired to /chat
│   ├── schemas.py, validator.py
│   └── (see docs/CYRUS_OPENAI_MODEL_ROUTING_IMPLEMENTATION_PLAN.md at repo root)
├── data/
│   ├── loader.py           Supabase batch fetchers — grades, RMP/instructors, courses, requirements, Fall 2026 sections
│   ├── analytics.py        Core Pandas logic — course_profile, professor_profile, natural_filter, detect_natural_params
│   ├── indexes.py          DataIndexes — precomputed O(1) instructor-GPA/course-stat/section lookups, built in lifespan(), passed into every handler
│   └── recency.py          Recency weighting for recent semesters
├── features/
│   ├── router.py           Keyword router + smart_display_n + extract_professor_name_from_profile_question
│   ├── course_profile.py   Handler for specific course questions ("CS 3114")
│   ├── professor_profile.py Handler for professor questions ("Hamouda"), includes RMP lookup
│   ├── natural_filter.py   Handler for filter/ranking questions ("highest GPA", "worst F rate")
│   ├── general_chat.py     Catch-all — tries natural_filter first, then LLM
│   ├── major_requirements.py Handler for graduation/degree requirement questions
│   ├── schedule_builder.py Handler for "build me a schedule" requests
│   ├── section_lookup.py   Handler for Fall 2026 timetable questions ("who is teaching CS 1114?", times/days/seats/location) — uses startup-loaded sections_df, falls back to live Supabase query
│   └── templated_answers.py Template fallbacks when LLM is unavailable
├── rag/
│   ├── gemma_client.py     Groq client, `openai/gpt-oss-120b` by default (legacy filename) — 30s timeout, returns None on failure
│   ├── query_planner.py    QueryPlanner — primary LLM planning/routing stage; replaces the old IntentExtractor + hardcoded section-signal override. On low confidence/timeout/malformed JSON, falls through to _deterministic_fallback_plan() (real keyword/regex router) before a bare clarification-request plan
│   ├── planner_models.py   QueryPlan Pydantic model — imported by query_planner.py and main.py
│   ├── intent_extractor.py Dead code — superseded by query_planner.py, no longer imported by main.py
│   ├── verifier.py         check_plan() — sufficiency gate; short-circuits with an honest "we don't have that" answer for known data gaps before handler dispatch
│   ├── query_rewriter.py   LLM query rewriting for retrieval
│   ├── retriever.py        Hybrid retrieval against Redis (redisvl vector KNN + RediSearch FT, fused via RRF)
│   ├── redis_schema.py     Shared redisvl index schema (retriever.py + scripts/sync_redis_index.py)
│   ├── reranker.py         Reranks retrieved candidates
│   ├── chunker.py          Splits source rows into embeddable chunks
│   ├── embedder.py         Multi-provider embedding wrapper (OpenAI → fastembed local)
│   ├── pipeline.py         RAG retrieval pipeline orchestration
│   ├── agentic_pipeline.py Planner → retrieve → critic agentic flow
│   ├── agents/planner.py   Plans retrieval steps
│   ├── agents/critic.py    Scores retrieval quality; LLM-judgement fallback on borderline final attempts
│   ├── observability.py    Per-stage timing + debug telemetry
│   ├── prompts.py          SYSTEM_PROMPT reference + build_answer_prompt
│   └── vector_store.py     Pandas keyword fallback + Redis-backed (redisvl) semantic search
├── safety/
│   ├── guardrails.py       SYSTEM_GUARDRAIL, normalize_question (whitespace/quote cleanup — LLM handles typos), sanitize_answer
│   ├── entity_resolver.py  Fuzzy-matches professor names + course codes after intent extraction
│   ├── refusals.py         classify_safety/refusal_answer — rule-based safety classifier, run as the FIRST gate in the chat pipeline (blocks system-prompt/secret extraction, private student records, destructive DB requests)
│   └── privacy.py          PII detection — returns warning if sensitive terms detected
└── utils/
    └── charts.py           table_spec, bar_chart, scatter_chart dict builders
```

## Endpoints

| Method | Path | Rate limit | Description |
|--------|------|-----------|-------------|
| `POST` | `/chat` | 10/min per IP | Main chatbot — returns answer, tables, charts |
| `POST` | `/feedback` | 30/min per IP | Log thumbs up (rating=1) or thumbs down (rating=-1) |
| `GET` | `/courses/search` | 60/min per IP | Typeahead course search |
| `GET` | `/professors/search` | 60/min per IP | Typeahead professor search |
| `POST` | `/retrieval/debug` | 30/min per IP | Runs the retrieval pipeline and returns candidate/scoring/timing telemetry — 404s unless `RAG_DEBUG_MODE=true` |
| `GET` | `/health` | none | Loaded row counts (grades, instructors, sections, courses, requirements) + vector store size |
| `GET` | `/ping` | none | No-auth Render healthcheck keepalive |
| `GET` | `/rmp/reviews` | 30/min per IP | Live proxy to RateMyProfessors' GraphQL API for review excerpts |
| `POST` | `/chat/stream` | 10/min per IP | Server-Sent-Events streaming variant of `/chat` |
| `GET` | `/feedback/recent` | 20/min per IP | Internal feedback review — gated by `X-Darvis-Dev-Token` header vs. `DEV_FEEDBACK_TOKEN` |

## Request flow

```
POST /chat  (real pipeline is _run_chat_pipeline() in main.py, ~450 lines — this is the shape, not the full detail)
  → classify_safety (safety/refusals.py)           # FIRST gate — blocks system-prompt/secret extraction, private records, destructive requests
  → normalize_question (guardrails.py)             # whitespace/quote cleanup (LLM handles typos)
  → prompt-injection / workload / curve-question short-circuits
  → deterministic-professor pre-planner (bypasses LLM via EntityResolver directly) OR QueryPlanner.plan (query_planner.py)
                                                     # primarily LLM → structured QueryPlan; on low confidence/failure falls through to _deterministic_fallback_plan() (real keyword router), then general_rag
  → EntityResolver (entity_resolver.py)            # fuzzy-correct professor/course names
  → check_plan (verifier.py)                       # sufficiency gate — short-circuits known data gaps before dispatch
  → handler (features/*.py)                        # analytics + LLM or template answer; optional secondary-route fan-out via _SECONDARY_ROUTE_PAIRS (failures swallowed, never break primary)
  → sanitize_answer (guardrails.py)
  → ChatResponse                                   # answer, tables, charts, warnings, schedule_actions (+ eval_trace if body.eval_mode is set, for the evals/ harness)

POST /feedback
  → FeedbackRequest validation           # question, answer, route, rating (1 or -1)
  → supabase.table("feedback").insert()  # writes to feedback table
  → 204 No Content
```

## Routes

Route strings come from `QueryPlanner` (`query_planner.py`) — primarily LLM, with a real deterministic keyword-router fallback (`_deterministic_fallback_plan()`) on low confidence/failure. `plan.secondary_routes` can fan out to a second handler for allowed route pairs (e.g. `course_profile` + `section_lookup`); a secondary-route failure never breaks the primary answer.

| Route | Triggered when | Handler |
|-------|---------------|---------|
| `course_profile` | Course code present ("CS 3114") | `course_profile.py` |
| `professor_profile` | Professor name or "professor" keyword | `professor_profile.py` |
| `natural_filter` | Ranking/filter language ("highest GPA", "worst F rate") | `natural_filter.py` |
| `major_requirements` | Graduation/degree requirement phrases | `major_requirements.py` |
| `schedule_builder` | "Build me a schedule" phrases | `schedule_builder.py` |
| `section_lookup` | Timetable phrasing ("who is teaching CS 3114", class times/days/seats/location) | `section_lookup.py` |
| `out_of_scope` | OUT_OF_SCOPE_TERMS match (currently empty list — disabled) | Canned response |
| `general_rag` | Everything else | `general_chat.py` |

## LLM (Groq)

- Model: `openai/gpt-oss-120b` (`GROQ_MODEL`), served via Groq's OpenAI-compatible endpoint (`base_url=https://api.groq.com/openai/v1`)
- Temperature: 0.2 (0.1 for raw/intent calls), `reasoning_effort="low"`
- 30-second timeout set on the client
- Returns `None` on any failure — caller falls back to `templated_answers.py`
- Note: the client class is still named `GemmaAnswerClient` (rag/gemma_client.py) — legacy name from before an earlier Gemma-era backend. Backend history: Anthropic → Groq migration, briefly reverted by a bad merge (`e0904af`), restored in `cbdf7db`
- Tone defined in `SYSTEM_GUARDRAIL`: advisor-style, lead with insight, support with numbers
- Never open with "Based on historical grade data..." — this is explicitly blocked in the system prompt

## Analytics layer (analytics.py)

Key functions:
- `course_profile(df, subject, course_no, min_students, use_recency)` — returns instructor comparison sorted by avg GPA
- `professor_profile(df, name, min_students, use_recency)` — returns courses taught by matched professor
- `natural_filter(df, question, top_n, use_recency)` — keyword-driven filter and sort
- `detect_natural_params(question)` — extracts sort_goal, subject_filter, level_filter from question text
- `extract_course_parts(question)` — pulls subject + course number from free text

Column names in the DataFrame use the original VT UDC CSV headers (e.g., `"Course No."`, `"A (%)"`, `"Graded Enrollment"`). The `_RENAME` map in `loader.py` handles the Supabase snake_case → original name conversion. Do not change `_RENAME` without updating `analytics.py`.

## Supabase tables used at runtime

| Table | Loaded by | Used for |
|-------|-----------|---------|
| `grades` | `load_from_supabase()` | All analytics — GPA, A rate, F rate, enrollment |
| `instructors` | `load_rmp_from_supabase()` | RMP ratings shown in professor answers |
| `courses` | `load_courses_from_supabase()` | Course catalog, vector store context |
| `major_requirements` | `load_requirements_from_supabase()` | Major requirement answers |
| `sections` | `load_sections_from_supabase()` at startup (term from `CURRENT_TERM` in config.py, default 202609) | Section lookups, course/professor profiles, schedule building. 10,663 rows, auto-refreshed every 4h by GitHub Actions; `schedule_builder.py` still queries `majors`/`major_requirements` live |
| `embeddings` | Source of truth; synced into Redis by `scripts/sync_redis_index.py` | Semantic search. Retrieval queries Redis at runtime, not this table directly. Redis index verified at 36,210 vectors via `/health` on 2026-07-31 (local + production) — embeddings have been rebuilt since the stale 4,576-row snapshot; see Known issues #1 |
| `feedback` | Written to via `POST /feedback` | Thumbs up/down ratings on chatbot answers |
| `echo_reviews` | Added by `migrations/003_echo_reviews.sql` (2026-07-05) | Read/written by `frontend/src/api.js`; served by chatbot `GET /rmp/reviews` |

## Known issues

**Accepted limitations:**

1. **Embeddings were stale, now rebuilt** — a prior snapshot had only 4,576 `embeddings` rows (built 2026-05-23, pre-import dataset). Verified via `/health` on 2026-07-31 (local dev + production `chat-bot-6dpo.onrender.com`): the live Redis index now has 36,210 vectors, well past the ~30.8k rebuild target — someone already ran `rebuild_embeddings --wipe` + `sync_redis_index` since this note was written. If retrieval quality regresses, re-run those two scripts; don't assume staleness without checking `/health`'s `vector_records` first.

2. **`rmp_tags` empty** — RMP's GraphQL API does not return `teacherRatingTags`. Confirmed after running `fetch_rmp_tags.js`. Ratings and difficulty scores are populated and working. Tags are a no-op.

3. **`courses.avg_gpa` partially null** — 5,468/6,589 courses have it; the remaining 1,121 have no matching grade rows.

**Low priority:**

4. **`grade_embeddings` table** — 0 rows, not referenced anywhere. Drop it when convenient.

5. **Two professor tables** — `instructors` (3,834 rows, 1,982 with RMP ratings) is read by both the frontend `api.js` and the chatbot. The legacy `professors` table (65 rows) is only written by `backend/scripts/import_rmp.js`, never read. Consolidate later.

## What not to break

- `SYSTEM_GUARDRAIL` in `guardrails.py`: defines the chatbot's advisor tone. Do not revert to data-dump phrasing.
- `_RENAME` map in `loader.py`: analytics.py expects original VT UDC column names. Changing one without the other breaks everything.
- Rate limiting in `main.py`: `/chat` is capped at 10 requests/minute per IP. Do not remove.
- CORS: `ALLOWED_ORIGINS` must include `https://darvis.tech`.
- Template fallbacks in `templated_answers.py`: every handler must return a string even when the LLM is down. Never return `None` as the answer.

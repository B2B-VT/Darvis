# Darvis chatbot — Claude Code context

FastAPI chatbot backend for darvis.tech. Deployed on Render. Loads all data from Supabase at startup, plans each question with an LLM-only `QueryPlanner` (no keyword-router fallback — low confidence or LLM failure returns a clarification request instead), runs Pandas analytics, and returns structured JSON with an LLM-generated or templated answer.

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
RAG_ENABLE_LLM_JUDGE=true  # Groq judges borderline retrieval quality before using it
CURRENT_TERM=202609        # optional — current term code (also CURRENT_TERM_LABEL="Fall 2026")
ALLOWED_ORIGINS=https://darvis.tech,http://localhost:3000
SHOW_DOCS=true             # local only — enables /docs
```

Run `python -m scripts.sync_redis_index` after seeding/rebuilding Supabase `embeddings`, or any time Redis comes up cold — it reads Supabase and (re)builds the Redis index that retrieval actually queries.

## File map

```
app/
├── main.py                 App factory, lifespan loader, intent+entity wiring, all routes (/chat, /feedback, /health, search, /retrieval/debug)
├── config.py               Pydantic settings from env
├── models.py               ChatRequest, ChatResponse, ChatMessage, TableSpec, ChartSpec, SearchItem, FeedbackRequest
├── data/
│   ├── loader.py           Supabase batch fetchers — grades, RMP/instructors, courses, requirements, Fall 2026 sections
│   ├── analytics.py        Core Pandas logic — course_profile, professor_profile, natural_filter, detect_natural_params
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
│   ├── gemma_client.py     Groq client via OpenAI-compatible SDK (legacy filename) — 30s timeout, returns None on failure
│   ├── query_planner.py    QueryPlanner — sole LLM-only planning/routing stage; replaces the old IntentExtractor + hardcoded section-signal override. No keyword fallback: low confidence/timeout/malformed JSON returns a clarification-request plan
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
│   ├── agents/critic.py    Scores retrieval quality; LLM-judgement fallback (Groq) on borderline final attempts
│   ├── observability.py    Per-stage timing + debug telemetry
│   ├── prompts.py          SYSTEM_PROMPT reference + build_answer_prompt
│   └── vector_store.py     Pandas keyword fallback + Redis-backed (redisvl) semantic search
├── safety/
│   ├── guardrails.py       SYSTEM_GUARDRAIL, normalize_question (whitespace/quote cleanup — LLM handles typos), sanitize_answer
│   ├── entity_resolver.py  Fuzzy-matches professor names + course codes after intent extraction
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
| `POST` | `/retrieval/debug` | 30/min per IP | Runs the retrieval pipeline and returns candidate/scoring/timing telemetry |
| `GET` | `/health` | none | Loaded row counts (grades, instructors, sections, courses, requirements) + vector store size |

## Request flow

```
POST /chat
  → normalize_question (guardrails.py)             # whitespace/quote cleanup (LLM handles typos)
  → QueryPlanner.plan (query_planner.py)           # LLM-only → structured QueryPlan (route + params); no keyword fallback — low confidence/failure returns a clarification-request plan
  → EntityResolver (entity_resolver.py)            # fuzzy-correct professor/course names
  → check_plan (verifier.py)                       # sufficiency gate — short-circuits known data gaps before dispatch
  → handler (features/*.py)                        # analytics + LLM or template answer; optional secondary-route fan-out
  → ChatResponse                                   # answer, tables, charts, warnings, schedule_actions

POST /feedback
  → FeedbackRequest validation           # question, answer, route, rating (1 or -1)
  → supabase.table("feedback").insert()  # writes to feedback table
  → 204 No Content
```

## Routes

Route strings come from `QueryPlanner` (LLM-only, `query_planner.py`) — no keyword-router fallback. `plan.secondary_routes` can fan out to a second handler for allowed route pairs (e.g. `course_profile` + `section_lookup`); a secondary-route failure never breaks the primary answer.

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

- Model: `openai/gpt-oss-120b` (`GROQ_MODEL`) — free tier, strict-JSON-capable, OpenAI-compatible endpoint at `https://api.groq.com/openai/v1`
- Temperature: 0.2 (0.1 for raw/intent calls), max output tokens: 800
- 30-second timeout set on the OpenAI client pointed at Groq
- Returns `None` on any failure — caller falls back to `templated_answers.py`
- Note: the client class is still named `GemmaAnswerClient` (rag/gemma_client.py) — legacy name, now on its second provider migration (Anthropic → Groq, 2026-07-17)
- Free-tier limit: 1,000 requests/day, 8,000 tokens/min on `gpt-oss-120b` — watch `console.groq.com/docs/deprecations` for model retirement notices
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
| `embeddings` | Source of truth; synced into Redis by `scripts/sync_redis_index.py` | Semantic search. Retrieval queries Redis at runtime, not this table directly. Current 4,576 vectors are STALE (see Known issues #1) |
| `feedback` | Written to via `POST /feedback` | Thumbs up/down ratings on chatbot answers |
| `echo_reviews` | Added by `migrations/003_echo_reviews.sql` (2026-07-05) | Read/written by `frontend/src/api.js`; served by chatbot `GET /rmp/reviews` |

## Known issues

**Accepted limitations:**

1. **Embeddings are stale** — all 4,576 `embeddings` rows date to 2026-05-23, built from the pre-import dataset (3,564 course chunks, 622 grade, 210 instructor, 180 requirement). The DB now has 6,589 courses, 59,790 grade rows (152 subjects), and 3,834 instructors, so RAG retrieval misses most current data. Rebuild to ~30.8k chunks: `python -m scripts.rebuild_embeddings --wipe`, then `python -m scripts.sync_redis_index`.

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

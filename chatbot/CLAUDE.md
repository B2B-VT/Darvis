# Darvis chatbot — Claude Code context

FastAPI chatbot backend for darvis.tech. Deployed on Render. Loads all data from Supabase at startup, extracts structured intent from each question with an LLM (`IntentExtractor`, with a keyword router as fallback), runs Pandas analytics, and returns structured JSON with an LLM-generated or templated answer.

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
GOOGLE_API_KEY=...
GOOGLE_MODEL=gemma-3-27b-it
SUPABASE_URL=https://rpmgcurhxrgtzbdixtay.supabase.co
SUPABASE_KEY=...           # service role key
ALLOWED_ORIGINS=https://darvis.tech,http://localhost:3000
SHOW_DOCS=true             # local only — enables /docs
```

## File map

```
app/
├── main.py                 App factory, lifespan loader, intent+entity wiring, all routes (/chat, /feedback, /health, search, /retrieval/debug)
├── config.py               Pydantic settings from env
├── models.py               ChatRequest, ChatResponse, TableSpec, ChartSpec, SearchItem
├── data/
│   ├── loader.py           Supabase batch fetchers — grades, RMP, courses, requirements
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
│   └── templated_answers.py Template fallbacks when LLM is unavailable
├── rag/
│   ├── gemma_client.py     Google AI Studio client — 30s timeout, returns None on failure
│   ├── intent_extractor.py LLM intent extraction (primary router) + keyword fallback
│   ├── query_rewriter.py   LLM query rewriting for retrieval
│   ├── retriever.py        Candidate retrieval (vector + keyword)
│   ├── reranker.py         Reranks retrieved candidates
│   ├── chunker.py          Splits source rows into embeddable chunks
│   ├── embedder.py         fastembed embedding wrapper
│   ├── pipeline.py         RAG retrieval pipeline orchestration
│   ├── agentic_pipeline.py Planner → retrieve → critic agentic flow
│   ├── agents/planner.py   Plans retrieval steps
│   ├── agents/critic.py    Critiques/validates the drafted answer
│   ├── observability.py    Per-stage timing + debug telemetry
│   ├── prompts.py          SYSTEM_PROMPT reference + build_answer_prompt
│   └── vector_store.py     Keyword search + optional pgvector semantic search via fastembed
├── safety/
│   ├── guardrails.py       SYSTEM_GUARDRAIL, normalize_question, sanitize_answer, typo/subject maps
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
| `GET` | `/health` | none | Row counts and vector store size |

## Request flow

```
POST /chat
  → normalize_question (guardrails.py)             # typo fix, subject expansion
  → IntentExtractor.extract (intent_extractor.py)  # LLM → structured intent (route + params); keyword router on fallback
  → EntityResolver (entity_resolver.py)            # fuzzy-correct professor/course names
  → handler (features/*.py)                        # analytics + LLM or template answer
  → ChatResponse                                   # answer, tables, charts, warnings, schedule_actions

POST /feedback
  → FeedbackRequest validation           # question, answer, route, rating (1 or -1)
  → supabase.table("feedback").insert()  # writes to feedback table
  → 204 No Content
```

## Routes

Route strings come from `IntentExtractor` (LLM); the keyword router is the fallback.

| Route | Triggered when | Handler |
|-------|---------------|---------|
| `course_profile` | Course code present ("CS 3114") | `course_profile.py` |
| `professor_profile` | Professor name or "professor" keyword | `professor_profile.py` |
| `natural_filter` | Ranking/filter language ("highest GPA", "worst F rate") | `natural_filter.py` |
| `major_requirements` | Graduation/degree requirement phrases | `major_requirements.py` |
| `schedule_builder` | "Build me a schedule" phrases | `schedule_builder.py` |
| `out_of_scope` | OUT_OF_SCOPE_TERMS match (currently empty list — disabled) | Canned response |
| `general_rag` | Everything else | `general_chat.py` |

## LLM (Gemma via Google AI Studio)

- Model: `gemma-3-27b-it`
- Temperature: 0.2, max output tokens: 800
- 30-second hard timeout at HTTP transport layer
- Returns `None` on any failure — caller falls back to `templated_answers.py`
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
| `sections` | Queried live in `schedule_builder.py` | Schedule building (Fall 2026, term 202609) |
| `embeddings` | Checked at startup in `vector_store.py` | Semantic search (4,576 vectors) |
| `feedback` | Written to via `POST /feedback` | Thumbs up/down ratings on chatbot answers |

## Known issues

**Accepted limitations:**

1. **Grades are CS only** — `grades` table has 1,706 rows, all CS. Every non-CS question returns empty analytics results and falls through to LLM general knowledge. UDC scraper for other subjects is pending hardware.

2. **`rmp_tags` empty** — RMP's GraphQL API does not return `teacherRatingTags`. Confirmed after running `fetch_rmp_tags.js`. Ratings and difficulty scores are populated and working. Tags are a no-op.

3. **`courses.avg_gpa` mostly null** — only 137/3,564 courses have it (CS only). Resolves as more grade data is imported.

**Low priority:**

4. **`grade_embeddings` table** — 0 rows, not referenced anywhere. Drop it when convenient.

5. **Two professor tables** — `instructors` (210 rows) is read by both the frontend `api.js` and the chatbot. The legacy `professors` table (65 rows) is only written by `backend/scripts/import_rmp.js`, never read. Consolidate later.

## What not to break

- `SYSTEM_GUARDRAIL` in `guardrails.py`: defines the chatbot's advisor tone. Do not revert to data-dump phrasing.
- `_RENAME` map in `loader.py`: analytics.py expects original VT UDC column names. Changing one without the other breaks everything.
- Rate limiting in `main.py`: `/chat` is capped at 10 requests/minute per IP. Do not remove.
- CORS: `ALLOWED_ORIGINS` must include `https://darvis.tech`.
- Template fallbacks in `templated_answers.py`: every handler must return a string even when the LLM is down. Never return `None` as the answer.

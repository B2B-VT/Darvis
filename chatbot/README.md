# Darvis — Chatbot backend

FastAPI backend powering the Darvis AI chatbot. Deployed on Render at the `/chat` endpoint. Loads all data from Supabase at startup into Pandas DataFrames, routes each question to a specialized handler, and returns structured JSON.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

**Required env vars:**
```
GOOGLE_API_KEY=your_google_ai_studio_key
GOOGLE_MODEL=gemma-3-27b-it
SUPABASE_URL=https://rpmgcurhxrgtzbdixtay.supabase.co
SUPABASE_KEY=your_service_role_key
ALLOWED_ORIGINS=https://darvis.tech,http://localhost:3000
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
├── main.py                 FastAPI app factory, lifespan data loader, route handlers
├── config.py               Pydantic settings (reads from .env)
├── models.py               ChatRequest, ChatResponse, TableSpec, ChartSpec, SearchItem
├── data/
│   ├── loader.py           Supabase batch fetchers — grades, RMP, courses, requirements
│   ├── analytics.py        Core Pandas logic — course_profile, professor_profile, natural_filter
│   └── recency.py          Recency weighting (recent semesters weighted higher)
├── features/
│   ├── router.py           Keyword router — maps incoming questions to a route string
│   ├── course_profile.py   "CS 3114" style questions
│   ├── professor_profile.py "Hamouda" style questions
│   ├── natural_filter.py   Filter/ranking questions ("highest GPA", "worst F rate")
│   ├── general_chat.py     Catch-all — tries natural_filter, then LLM fallback
│   ├── major_requirements.py "What do I need to graduate with CS?" questions
│   ├── schedule_builder.py "Build me a schedule" requests
│   └── templated_answers.py Template fallbacks when LLM is unavailable or quota'd
├── rag/
│   ├── gemma_client.py     Google AI Studio client (30s HTTP timeout, template fallback on error)
│   ├── prompts.py          System prompt reference + build_answer_prompt
│   └── vector_store.py     Keyword search + optional pgvector semantic search
├── safety/
│   ├── guardrails.py       SYSTEM_GUARDRAIL prompt, NLP normalization, answer sanitization, typo map
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
  }
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

Returns row counts and vector store size.

## Routes

| Route string | Triggered by | Handler |
|---|---|---|
| `course_profile` | Specific course code in question | `course_profile.py` |
| `professor_profile` | Professor name or "professor" keyword | `professor_profile.py` |
| `natural_filter` | Ranking/filtering language ("highest GPA", "worst F rate") | `natural_filter.py` |
| `major_requirements` | Graduation/degree requirement questions | `major_requirements.py` |
| `schedule_builder` | "Build me a schedule" requests | `schedule_builder.py` |
| `out_of_scope` | OUT_OF_SCOPE_TERMS match (currently empty — disabled) | Canned response |
| `general_rag` | Everything else | `general_chat.py` |

## LLM behavior

- Model: Gemma via Google AI Studio (`gemma-3-27b-it`)
- Temperature: 0.2
- Max output tokens: 800
- Hard timeout: 30 seconds at HTTP transport layer
- On any failure (timeout, 429, safety block, empty output): falls back to template answer from `templated_answers.py`
- Tone: advisor-style — lead with the practical insight, support with numbers. Never open with "Based on historical grade data..."

## Semantic search

`embeddings` table in Supabase has 4,576 rows with pgvector vectors. `search_embeddings` RPC exists. Semantic search activates automatically at startup if `fastembed` is installed and the embeddings table is non-empty. Falls back to keyword search silently if unavailable.

`grade_embeddings` is a separate dead table with 0 rows — ignore it.

## Known issues and pending work

1. **Grades data is CS only** — 1,706 rows. Every non-CS question returns no results from the database. UDC scraper for remaining subjects (ECE, MATH, BIOL, etc.) is pending hardware.
2. **`natural_filter.py` chart label bug** — `lowest_gpa` sort goal maps to `"Avg GPA"` chart metric label, same as `highest_gpa`. Needs a directional label.
3. **No feedback logging** — thumbs up/down endpoint doesn't exist yet. No way to capture which answers users found helpful.
4. **`courses.avg_gpa` mostly null** — only 137/3,564 courses have it populated (the CS ones). Resolves automatically as more grade data is imported.
5. **`rmp_tags` empty** — RMP's GraphQL API doesn't return `teacherRatingTags`. Confirmed via `fetch_rmp_tags.js`. Accepted limitation; ratings and difficulty are populated and working.
6. **Two professor tables** — `professors` (65 rows, used by frontend) and `instructors` (210 rows, used by chatbot). Inconsistency to resolve when convenient.

# Darvis — Claude Code context

Darvis is a live Virginia Tech academic intelligence platform at darvis.tech. Students use it to look up grade distributions, compare professors, build schedules, and ask the AI chatbot questions like "which CS 3114 professor has the strongest outcomes?" Auth is handled by Clerk (currently in waitlist/beta mode). Built and maintained by Pujan Patel.

## Repo layout

```
Hokie_Darvis/
├── frontend/           React 18 + Vite — deployed on Vercel
├── chat-bot/           FastAPI chatbot backend — deployed on Render
├── backend/            Node.js data scripts (scrapers, importers) — not a server
└── CLAUDE.md
```

## Frontend

React 18 built with Vite (`@vitejs/plugin-react`). Auth via `@clerk/clerk-react`, Supabase via `@supabase/supabase-js`, charts via `chart.js` — all npm packages. Styles are CSS-in-JS inline objects — no Tailwind, no CSS modules.

**Run locally:**
```bash
cd frontend
npm run dev        # http://localhost:5173
```

**Deploy:** git push to main → Vercel auto-deploys.

**Key files:**
- `frontend/src/App.jsx` — root component, page routing, global dark mode state
- `frontend/src/api.js` — all Supabase calls from the frontend
- `frontend/src/config.js` — Supabase URL + publishable key
- `frontend/src/components/` — one file per page/feature

**Auth:** Clerk. Users must be signed in to access courses, schedule, chatbot, and forums. Waitlist mode is enabled in the Clerk dashboard (Configure → Restrictions → Sign-up mode).

## Chat-bot

FastAPI backend in Python. Loads all data from Supabase at startup into Pandas DataFrames. Routes each question through a keyword-based router, runs analytics, generates a templated or LLM answer, and returns JSON with `answer`, `tables`, `charts`, `warnings`, `metadata`, `schedule_actions`.

**Run locally:**
```bash
cd chat-bot
source .venv/bin/activate
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

**Deploy:** git push to main → Render auto-deploys.

**LLM:** Google AI Studio (Gemma). Set `GOOGLE_API_KEY` and `GOOGLE_MODEL` in `chat-bot/.env`. Current model string: `gemma-3-27b-it`. Has a 30-second HTTP timeout at the transport layer. Falls back to template answers when the LLM is unavailable.

**Required env vars (`chat-bot/.env`):**
```
GOOGLE_API_KEY=...
GOOGLE_MODEL=gemma-3-27b-it
SUPABASE_URL=...
SUPABASE_KEY=...           # service role key
ALLOWED_ORIGINS=https://darvis.tech,...
```

**Architecture:**
```
app/
├── main.py                 FastAPI app, lifespan data loader, all routes
├── config.py               Pydantic settings from env
├── models.py               ChatRequest, ChatResponse, TableSpec, ChartSpec
├── data/
│   ├── loader.py           Supabase batch fetchers for grades, RMP, courses, requirements
│   ├── analytics.py        Pandas aggregations — course_profile, professor_profile, natural_filter
│   └── recency.py          Recency weighting for recent semesters
├── features/
│   ├── router.py           Keyword router — maps questions to handler routes
│   ├── course_profile.py   Handler for specific course questions (CS 3114)
│   ├── professor_profile.py Handler for professor questions (Hamouda)
│   ├── natural_filter.py   Handler for filter/ranking questions (highest GPA, worst F rate)
│   ├── general_chat.py     Catch-all — tries natural_filter, then LLM fallback
│   ├── major_requirements.py Handler for graduation requirement questions
│   ├── schedule_builder.py Handler for schedule builder requests
│   └── templated_answers.py Template fallbacks when LLM is unavailable
├── rag/
│   ├── gemma_client.py     Google AI Studio LLM client
│   ├── prompts.py          System prompt + build_answer_prompt
│   └── vector_store.py     Keyword + semantic search over grade data
├── safety/
│   ├── guardrails.py       System prompt, NLP normalization, answer sanitization
│   └── privacy.py          PII detection in questions
└── utils/
    └── charts.py           table_spec, bar_chart, scatter_chart helpers
```

## Backend (Node scripts)

Not a server. These are one-off data scripts.

```
backend/
├── scrapers/
│   ├── udc_cs_manual.js    Paste into browser console on udc.vt.edu to scrape grades
│   └── rmp_scraper.js      Scrapes all VT professors from RMP GraphQL API
├── scripts/
│   ├── import_grades.js    Reads CSVs from data/raw/, upserts to Supabase grades table
│   ├── import_rmp.js       Matches RMP data to instructors table by last name
│   └── fetch_rmp_tags.js   Fetches individual RMP profiles to populate rmp_tags in instructors table
└── supabase/
    └── schema.sql          Full DB schema
```

**Run scripts:**
```bash
cd backend
node scripts/import_grades.js       # after dropping CSVs in data/raw/
node scripts/fetch_rmp_tags.js      # populate RMP tags
```

## Supabase database

Project ID: `rpmgcurhxrgtzbdixtay`

| Table | Rows | Notes |
|-------|------|-------|
| `grades` | 1,706 | CS only — UDC scraper needed for all other subjects |
| `courses` | 3,564 | All have `total_sections`; only 137 have `avg_gpa`; none have `pathways` or `description` |
| `sections` | 10,129 | Fall 2026 (term `202609`); 2 rows missing `start_time` (handled) |
| `instructors` | 210 | 65 have RMP ratings + rmp_id; all have empty `rmp_tags` (RMP API limitation) |
| `professors` | 65 | Legacy table used by frontend `api.js`; chatbot uses `instructors` |
| `majors` | 183 | Full list |
| `major_requirements` | 16,151 | Full list |
| `embeddings` | 4,576 | Vectors populated; `search_embeddings` RPC exists; semantic search ready |
| `grade_embeddings` | 0 | Dead/unused — left over from earlier architecture |
| `forum_posts` | 0 | Empty — no users yet |
| `forum_replies` | 0 | Empty |

**Key issue:** `grades` only has CS data. Every non-CS question returns no results. UDC scraper needs to run for ECE, MATH, BIOL, and all other subjects — currently blocked waiting on faster hardware.

## Known issues and pending work

**High priority:**
- Scrape remaining UDC subjects (ECE, MATH, BIOL, etc.) — waiting on hardware. Use `backend/scrapers/udc_cs_manual.js` adapted for each subject.
- `courses.avg_gpa` is null for 3,427 of 3,564 courses (only CS has grade data to populate it). Will fix itself as more grade data is imported.
- `courses.pathways` empty for all courses — VT Pathways data never populated. Static JSON lookup file needed.

**Medium priority:**
- `natural_filter.py`: `lowest_gpa` sort goal sets chart metric label to `"Avg GPA"` — same as `highest_gpa`. Add directional label.
- Feedback collection: `POST /feedback` endpoint exists in chatbot (writes to `feedback` table). Frontend thumbs up/down UI still needs to be wired up.
- `grade_embeddings` table is dead (0 rows, unused). Can be dropped.

**Low priority:**
- Two professor tables (`professors` + `instructors`) create inconsistency. Frontend uses `professors`, chatbot uses `instructors`. Consolidate when convenient.
- `rmp_tags` is empty for all 65 instructors with RMP data. RMP's GraphQL API does not return `teacherRatingTags` — confirmed after running `fetch_rmp_tags.js`. Accepted limitation.

## Deployment

| Service | What | URL |
|---------|------|-----|
| Vercel | Frontend | https://darvis.tech |
| Render | Chat-bot FastAPI | https://darvis-chat.onrender.com (or similar) |
| Supabase | Database | project ID rpmgcurhxrgtzbdixtay |
| Clerk | Auth | clerk.darvis.tech |

Render free tier sleeps after inactivity — first request takes ~30 seconds. Upgrade to Render Starter ($7/month) to eliminate cold starts.

## What not to break

- `guardrails.py` SYSTEM_GUARDRAIL: the chatbot tone is deliberately advisor-style — leads with the insight, supports with numbers. Do not revert to "Based on historical grade data..." phrasing.
- `loader.py` column rename map (`_RENAME`): the analytics layer expects the original VT UDC CSV column names. Don't change the rename mapping without updating analytics.py too.
- Rate limiting: `/chat` is limited to 10 requests/minute per IP. Do not remove this.
- CORS: `ALLOWED_ORIGINS` in `.env` controls which origins can call the chat API. Darvis.tech must be in the list.

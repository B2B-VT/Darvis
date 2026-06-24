# Darvis — Claude Code context

Darvis is a live Virginia Tech academic intelligence platform at darvis.tech. Students use it to look up grade distributions, compare professors, build schedules, and ask the AI chatbot questions like "which CS 3114 professor has the strongest outcomes?" Auth is handled by Clerk (currently in waitlist/beta mode). Built and maintained by Pujan Patel.

## Repo layout

```
Darvis/
├── frontend/               React 18 + Vite — deployed on Vercel
├── chatbot/                FastAPI chatbot backend — deployed on Render
├── backend/                Node.js data scripts (scrapers, importers) — not a server
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
- `frontend/src/config.js` — Supabase URL + publishable key, chatbot API URL
- `frontend/src/supabase.js` — Supabase client singleton
- `frontend/src/theme.jsx` — dark/light theme tokens

**Component map (`src/components/`):**
| File | Page/feature |
|------|-------------|
| `landing.jsx` | Public marketing/landing page |
| `courses.jsx` | Grade distribution browser + filters |
| `instructors.jsx` | Professor listing with RMP ratings |
| `dashboard-prof.jsx` | Professor detail view |
| `schedule.jsx` | Schedule builder (Fall 2026 sections) |
| `chatbot.jsx` | AI chat interface → `POST /chat` |
| `forums.jsx` | Community forum (empty — no users yet) |
| `profile-page.jsx` | User profile (Clerk user data) |
| `profile-modal.jsx` | Profile edit modal |
| `nav-auth.jsx` | Top nav with Clerk sign-in/out |
| `auth-gate.jsx` | Wraps all auth-required pages |
| `auth-modal.jsx` | Sign-in prompt modal |
| `faqs.jsx` | FAQ page |
| `icons.jsx` | Shared SVG icon components |

**Auth:** Clerk. Users must be signed in to access courses, schedule, chatbot, and forums. Waitlist mode is enabled in the Clerk dashboard (Configure → Restrictions → Sign-up mode).

## Chat-bot

FastAPI backend in Python. Loads all data from Supabase at startup into Pandas DataFrames. Extracts intent from each question with an LLM (Gemma `IntentExtractor`, falling back to a keyword router), resolves professor/course names with a fuzzy `EntityResolver`, runs analytics, generates a templated or LLM answer, and returns JSON with `answer`, `tables`, `charts`, `warnings`, `metadata`, `schedule_actions`.

**Run locally:**
```bash
cd chatbot
source .venv/bin/activate
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

**Deploy:** git push to main → Render auto-deploys (root directory set to `chatbot/` in Render config).

**LLM:** Google AI Studio (Gemma). Set `GOOGLE_API_KEY` and `GOOGLE_MODEL` in `chatbot/.env`. Current model string: `gemma-3-27b-it`. Has a 30-second HTTP timeout at the transport layer. Falls back to template answers when the LLM is unavailable.

**Required env vars (`chatbot/.env`):**
```
GOOGLE_API_KEY=...
GOOGLE_MODEL=gemma-3-27b-it
SUPABASE_URL=...
SUPABASE_KEY=...           # service role key
REDIS_URL=...              # Redis Stack / Redis Cloud — semantic + keyword search (redisvl)
ALLOWED_ORIGINS=https://darvis.tech,...
```

**Architecture:** See `chatbot/CLAUDE.md` for the full file map and request flow.

## Backend (Node scripts)

Not a server. These are one-off data scripts.

```
backend/
├── scrapers/
│   ├── udc_single_scraper.js        Browser console: one selected subject → CSV
│   ├── udc_batch_scraper.js         Browser console: selected subject forward, CSV each
│   ├── udc_grades_scraper.js        Browser console: one subject per run, resumable
│   ├── udc_2020_present_scraper.js  Browser console: all subjects × courses, 2020-21→2025-26
│   ├── rmp_scraper.js               Scrapes all VT professors from RMP GraphQL API → data/raw/
│   └── catalog_scraper.js           Scrapes course descriptions from catalog.vt.edu → data/raw/
├── scripts/
│   ├── import_grades.js        Reads vt_udc_grades_*.csv from data/raw/, upserts grades + courses
│   ├── import_timetable.js     Reads vt_timetable_*.csv, upserts to sections table
│   ├── import_descriptions.js  Reads course_descriptions.json, fills courses.description
│   ├── import_rmp.js           Matches RMP by last name, upserts to legacy professors table
│   └── fetch_rmp_tags.js       Fetches RMP profiles for rmp_tags — no-op (API returns none)
└── supabase/
    └── schema.sql              Full DB schema
```

**Run scripts:**
```bash
cd backend
npm run import-grades               # after dropping vt_udc_grades_*.csv in data/raw/
npm run import-timetable            # after dropping vt_timetable_*.csv in data/raw/
node scripts/import_rmp.js          # match + import RMP ratings
```

## Supabase database

Project ID: `rpmgcurhxrgtzbdixtay`

| Table | Rows | Notes |
|-------|------|-------|
| `grades` | 1,706 | CS only — UDC scraper needed for all other subjects |
| `courses` | 3,564 | All have `total_sections`; only 137 have `avg_gpa`; none have `pathways` or `description` |
| `sections` | 10,129 | Fall 2026 (term `202609`); 2 rows missing `start_time` (handled) |
| `instructors` | 210 | 65 have RMP ratings + rmp_id; all have empty `rmp_tags` (RMP API limitation) |
| `professors` | 65 | Legacy. Written by `import_rmp.js`, not read by app code — frontend `api.js` and chatbot both read `instructors` |
| `majors` | 183 | Full list |
| `major_requirements` | 16,151 | Full list |
| `embeddings` | 4,576 | Vectors populated; this is the source of truth. Synced into a Redis (redisvl) index by `scripts/sync_redis_index.py` — retrieval queries Redis at runtime, not this table directly. Legacy `search_embeddings`/`hybrid_search` Postgres RPCs are no longer called by the chatbot but remain in the schema |
| `grade_embeddings` | 0 | Dead/unused — left over from earlier architecture |
| `forum_posts` | 0 | Empty — no users yet |
| `forum_replies` | 0 | Empty |

**Key issue:** `grades` only has CS data. Every non-CS question returns no results. UDC scraper needs to run for ECE, MATH, BIOL, and all other subjects — currently blocked waiting on faster hardware.

## Known issues and pending work

**High priority:**
- Scrape remaining UDC subjects (ECE, MATH, BIOL, etc.) — waiting on hardware. Use the `backend/scrapers/udc_*_scraper.js` browser-console scripts (one-subject, batch, or all-subjects variants).
- `courses.avg_gpa` is null for 3,427 of 3,564 courses (only CS has grade data to populate it). Will fix itself as more grade data is imported.
- `courses.pathways` empty for all courses — VT Pathways data never populated. Static JSON lookup file needed.

**Medium priority:**
- `natural_filter.py`: `lowest_gpa` sort goal sets chart metric label to `"Avg GPA"` — same as `highest_gpa`. Add directional label.
- Feedback collection: `POST /feedback` endpoint exists in chatbot (writes to `feedback` table). Frontend thumbs up/down UI still needs to be wired up.
- `grade_embeddings` table is dead (0 rows, unused). Can be dropped.

**Low priority:**
- Two professor tables (`professors` + `instructors`) create inconsistency. Both the frontend `api.js` and the chatbot read `instructors`; the legacy `professors` table is only written (by `import_rmp.js`), never read. Consolidate when convenient.
- `rmp_tags` is empty for all 65 instructors with RMP data. RMP's GraphQL API does not return `teacherRatingTags` — confirmed after running `fetch_rmp_tags.js`. Accepted limitation.

## Deployment

| Service | What | URL |
|---------|------|-----|
| Vercel | Frontend | https://darvis.tech |
| Render | Chat-bot FastAPI | https://chat-bot-6dpo.onrender.com |
| Supabase | Database | project ID rpmgcurhxrgtzbdixtay |
| Redis Cloud | Vector + keyword search index (redisvl) | synced from Supabase `embeddings` via `scripts/sync_redis_index.py` |
| Clerk | Auth | clerk.darvis.tech |

Render free tier sleeps after inactivity — first request takes ~30 seconds. Upgrade to Render Starter ($7/month) to eliminate cold starts.

## What not to break

- `guardrails.py` SYSTEM_GUARDRAIL: the chatbot tone is deliberately advisor-style — leads with the insight, supports with numbers. Do not revert to "Based on historical grade data..." phrasing.
- `loader.py` column rename map (`_RENAME`): the analytics layer expects the original VT UDC CSV column names. Don't change the rename mapping without updating analytics.py too.
- Rate limiting: `/chat` is limited to 10 requests/minute per IP. Do not remove this.
- CORS: `ALLOWED_ORIGINS` in `.env` controls which origins can call the chat API. Darvis.tech must be in the list.

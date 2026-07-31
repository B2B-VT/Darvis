# Darvis — Claude Code context

Darvis is a live Virginia Tech academic intelligence platform at darvis.tech. Students use it to look up grade distributions, compare professors, build schedules, and ask the AI chatbot questions like "which CS 3114 professor has the strongest outcomes?" Auth is handled by Clerk (currently in waitlist/beta mode). Built and maintained by Pujan Patel.

## Repo layout

```
Darvis/
├── frontend/               React 18 + Vite — deployed on Vercel
├── chatbot/                FastAPI chatbot backend — deployed on Render
├── backend/                Node.js data scripts (scrapers, importers) — not a server
├── .github/workflows/      CI — update-timetable.yml (authenticated Banner scrape every 4h)
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

**Tooling:** no ESLint/Prettier config and no test runner (Jest/Vitest) set up yet — plain JS, manual formatting.

**Tooling:** no ESLint/Prettier config and no test runner (Jest/Vitest) set up yet — plain JS, manual formatting.

**Key files:**
- `frontend/src/main.jsx` — entry point; requires `VITE_CLERK_PUBLISHABLE_KEY` in `frontend/.env`
- `frontend/src/App.jsx` — root component, page routing (`page` state, no router lib), global dark mode state
- `frontend/src/api.js` — centralizes most Supabase calls from the frontend (`dashboard-prof.jsx`, `forums.jsx`, `instructors.jsx`, `profile-modal.jsx` query the `db` client from `supabase.js` directly instead)
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
| `legal-page.jsx` | Legal/policy page |
| `skeletons.jsx` | Loading-state skeleton components |
| `icons.jsx` | Shared SVG icon components |
| `app-shell.jsx` | Outer shell — nav, sidebar, page switcher |

**Auth:** Clerk. Users must be signed in to access courses, schedule, chatbot, and forums. Waitlist mode is enabled in the Clerk dashboard (Configure → Restrictions → Sign-up mode).

## Chat-bot

FastAPI backend in Python. Loads all data from Supabase at startup into Pandas DataFrames. Plans each question with an LLM-only `QueryPlanner` (`app/rag/query_planner.py`) — no keyword-router fallback; low confidence or LLM failure returns a clarification request instead of guessing — resolves professor/course names with a fuzzy `EntityResolver`, runs a sufficiency gate before dispatch, runs analytics, generates a templated or LLM answer, and returns JSON with `answer`, `tables`, `charts`, `warnings`, `metadata`, `schedule_actions`.

**Run locally:**
```bash
cd chatbot
source .venv/bin/activate
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

**Tests:** pytest suite in `chatbot/tests/` (intent extractor, planner critic, retrieval eval, normalization):
```bash
cd chatbot && python -m pytest tests/
```

**Other dirs:** `chatbot/scripts/` — embedding builders (`build_embeddings.py`, `rebuild_embeddings.py`, `embed_grades.py`), `sync_redis_index.py` (Supabase `embeddings` → Redis index), `scrape_curriculum.py`. `chatbot/migrations/` — SQL migrations.

**Deploy:** git push to main → Render auto-deploys (root directory set to `chatbot/` in Render config).

**LLM:** Anthropic Claude Haiku (migrated from Gemma in commit `200b142` — the client class/file still carry the legacy name `GemmaAnswerClient`/`gemma_client.py`). Set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` in `chatbot/.env`. Current model string: `claude-haiku-4-5-20251001`. 30-second client timeout. Falls back to template answers when the LLM is unavailable.

**Required env vars (`chatbot/.env`):**
```
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
SUPABASE_URL=...
SUPABASE_KEY=...                    # service role key
REDIS_URL=...                       # Redis Stack / Redis Cloud — semantic + keyword search (redisvl)
RAG_REDIS_INDEX_NAME=darvis_embeddings
RAG_ENABLE_LLM_JUDGE=true           # Claude Haiku judges borderline retrieval quality
ALLOWED_ORIGINS=https://darvis.tech,...
SHOW_DOCS=true                      # local only — enables /docs (Swagger UI)
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
│   ├── udc_playwright_scraper.js    Playwright (headless): scrape grades without browser console
│   ├── udc_diag.js                  Diagnostic — inspect UDC page structure
│   ├── udc_intercept.js             Network intercept variant of UDC scraper
│   ├── banner_timetable_scraper.js  Banner timetable (unauthenticated) → sections
│   ├── banner_puppeteer_scraper.js  Authenticated Banner scrape — instructor + seat data; run by CI
│   ├── banner_auth_helper.js        Interactive CAS/Duo login — saves browser profile cookies
│   ├── rmp_scraper.js               Scrapes all VT professors from RMP GraphQL API → data/raw/
│   ├── catalog_scraper.js           Scrapes course descriptions from catalog.vt.edu → data/raw/
│   ├── prereq_scraper.js            Scrapes course prerequisites from catalog → data/raw/
│   └── pathways_scraper.js          Scrapes VT Pathways concept-area codes from catalog → data/raw/
├── scripts/
│   ├── import_grades.js        Reads vt_udc_grades_*.csv from data/raw/, upserts grades + courses
│   ├── import_all_grades.js    Bulk variant — imports all grade CSVs in one pass
│   ├── import_timetable.js     Reads vt_timetable_*.csv, upserts to sections table
│   ├── import_descriptions.js  Reads course_descriptions.json, fills courses.description
│   ├── import_prerequisites.js Reads course_prerequisites.json, updates courses.prerequisites
│   ├── import_pathways.js      Reads course_pathways.json, updates courses.pathways
│   ├── import_rmp.js           Matches RMP by last name, upserts to legacy professors table
│   ├── rebuild_instructors.js  Rebuilds instructors table from all subjects + fresh RMP data
│   ├── fetch_rmp_tags.js       Fetches RMP profiles for rmp_tags — no-op (API returns none)
│   └── update_banner_secret.sh Re-encodes Banner cookies → GitHub secret BANNER_PROFILE_B64
└── supabase/
    └── schema.sql              Full DB schema
```

**Run scripts:**
```bash
cd backend
npm run import-grades               # after dropping vt_udc_grades_*.csv in data/raw/
npm run import-timetable            # after dropping vt_timetable_*.csv in data/raw/
npm run scrape-grades               # Playwright headless scrape (udc_playwright_scraper.js)
npm run scrape-prereqs              # scrape prerequisites from catalog.vt.edu
npm run import-prerequisites        # import scraped prereqs into DB
npm run scrape-catalog              # scrape course descriptions from catalog.vt.edu
npm run import-descriptions         # fill courses.description from scraped JSON
npm run scrape-pathways             # scrape VT Pathways concept-area codes from catalog.vt.edu
npm run import-pathways             # fill courses.pathways from scraped JSON
npm run scrape-timetable            # Banner timetable scrape (unauthenticated)
npm run auth-banner                 # interactive CAS/Duo login — saves Banner browser profile
npm run scrape-timetable-auth       # authenticated Puppeteer scrape — instructor + seats
npm run update-banner-secret        # push refreshed cookies to GitHub secret BANNER_PROFILE_B64
node scripts/import_rmp.js          # match + import RMP ratings
node scripts/rebuild_instructors.js # rebuild instructors from all subjects + RMP
```

**CI (`.github/workflows/update-timetable.yml`):** every 4h (cron `0 */4 * * *`) + manual dispatch. Node 22, restores Chrome cookies from secret `BANNER_PROFILE_B64`, runs `banner_puppeteer_scraper.js` with `NO_DELETE=true HEADLESS=true`, upserts sections. Secrets: `BANNER_PROFILE_B64`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. After each local re-auth, refresh the secret with `npm run update-banner-secret`.

## Supabase database

Project ID: `rpmgcurhxrgtzbdixtay`

Row counts verified live 2026-07-01:

| Table | Rows | Notes |
|-------|------|-------|
| `grades` | 59,790 | All 152 subjects, 2020–2026 — full UDC import complete |
| `courses` | 6,589 | 5,468 have `avg_gpa`; 5,051 have `description`, 1,153 have `prerequisites`, 751 have `pathways` (all scraped from catalog.vt.edu) |
| `sections` | 10,663 | Fall 2026 only (term `202609`); auto-updated every 4h by CI Banner scrape |
| `instructors` | 3,834 | 1,982 have RMP ratings; `rmp_tags` empty for all (RMP API limitation) |
| `professors` | 65 | Legacy. Written by `import_rmp.js`, not read by app code — frontend `api.js` and chatbot both read `instructors` |
| `majors` | 183 | Full list |
| `major_requirements` | 16,290 | Full list |
| `embeddings` | 4,576 | Vectors populated; this is the source of truth. Synced into a Redis (redisvl) index by `scripts/sync_redis_index.py` — retrieval queries Redis at runtime, not this table directly. Legacy `search_embeddings`/`hybrid_search` Postgres RPCs are no longer called by the chatbot but remain in the schema |
| `grade_embeddings` | 0 | Dead/unused — left over from earlier architecture |
| `forum_posts` | 1 | Effectively empty — no users yet |
| `forum_replies` | 0 | Empty |
| `echo_reviews` | not in 2026-07-01 snapshot | Added `chatbot/migrations/003_echo_reviews.sql` (commit `7940a06`, 2026-07-05) — live table, read/written by `frontend/src/api.js` and served by chatbot `GET /rmp/reviews` |

## Known issues and pending work

**High priority:**
- `courses.avg_gpa` still null for 1,121 of 6,589 courses (no grade rows for those courses).

**Medium priority:**
- Feedback collection: `POST /feedback` endpoint exists in chatbot (writes to `feedback` table). Frontend thumbs up/down UI still needs to be wired up.
- `grade_embeddings` table is dead (0 rows, unused). Can be dropped.

**Low priority:**
- Two professor tables (`professors` + `instructors`) create inconsistency. Both the frontend `api.js` and the chatbot read `instructors`; the legacy `professors` table is only written (by `import_rmp.js`), never read. Consolidate when convenient.
- `rmp_tags` is empty for all 1,982 instructors with RMP data. RMP's GraphQL API does not return `teacherRatingTags` — confirmed after running `fetch_rmp_tags.js`. Accepted limitation.

## Deployment

| Service | What | URL |
|---------|------|-----|
| Vercel | Frontend | https://darvis.tech |
| Render | Chat-bot FastAPI | https://chat-bot-6dpo.onrender.com |
| Supabase | Database | project ID rpmgcurhxrgtzbdixtay |
| Redis Cloud | Vector + keyword search index (redisvl) | synced from Supabase `embeddings` via `scripts/sync_redis_index.py` |
| Clerk | Auth | clerk.darvis.tech |
| GitHub Actions | Timetable auto-update (every 4h) | `.github/workflows/update-timetable.yml` |

Render free tier sleeps after inactivity — first request takes ~30 seconds. Upgrade to Render Starter ($7/month) to eliminate cold starts.

## What not to break

- `guardrails.py` SYSTEM_GUARDRAIL: the chatbot tone is deliberately advisor-style — leads with the insight, supports with numbers. Do not revert to "Based on historical grade data..." phrasing.
- `loader.py` column rename map (`_RENAME`): the analytics layer expects the original VT UDC CSV column names. Don't change the rename mapping without updating analytics.py too.
- Rate limiting: `/chat` is limited to 10 requests/minute per IP. Do not remove this.
- CORS: `ALLOWED_ORIGINS` in `.env` controls which origins can call the chat API. Darvis.tech must be in the list.

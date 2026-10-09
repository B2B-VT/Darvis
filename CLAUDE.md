# Darvis — Claude Code context

Darvis is a live Virginia Tech academic intelligence platform at darvis.tech. Students use it to look up grade distributions, compare professors, build schedules, and ask the AI chatbot ("Cyrus") questions like "which CS 3114 professor has the strongest outcomes?" Auth is handled by Clerk (waitlist/beta mode). Built and maintained by Pujan Patel.

This is the only CLAUDE.md in the repo, and `README.md` is the only README. On 2026-10-08 the repo was purged of dead code, generated eval outputs, finished design docs (`docs/`), the old workbook QA harness, Codex config (`AGENTS.md`, `.codex/`) and duplicate media. Anything removed is recoverable from git history.

## Repo layout

```
Darvis/
├── frontend/      React 19 + Vite SPA — deployed on Vercel
├── chatbot/       FastAPI chatbot backend (Cyrus) — deployed on Render
├── backend/       Node.js data scripts (scrapers + Supabase importers) — not a server
├── evals/         Cyrus JSONL eval harness (run.py) — chatbot/tests import it via chatbot/conftest.py's sys.path insert
├── .github/       workflows/update-timetable.yml (Banner scrape every 4h); CODEOWNERS → @pujanpatel08
├── .claude/       hookify.git-commands-after-changes.local.md — stop-event rule: print git add/commit/push after every change
├── README.md
└── CLAUDE.md
```

## Frontend

React 19.2 + Vite 8 (`@vitejs/plugin-react` 6). Clerk via `@clerk/clerk-react` 5, Supabase via `@supabase/supabase-js` 2, `chart.js` 4 for chatbot charts, `pdfjs-dist` solely for the LinkedIn-PDF profile import in `profile-page.jsx`. Styles are CSS-in-JS inline objects — no Tailwind, no CSS modules. No `.nvmrc`/`engines`: local dev runs Node 24, CI runs Node 22. No ESLint/Prettier and no test runner — plain JS, manual formatting.

```bash
cd frontend
npm run dev      # http://localhost:5173
npm run build    # sanity check; the ">500 kB chunk" warning is known and harmless
```

**Deploy:** push to `main` → Vercel auto-deploys.

**Key files:**
- `frontend/src/main.jsx` — entry point; requires `VITE_CLERK_PUBLISHABLE_KEY` in `frontend/.env` (no `.env.example` — create it yourself). Throws if the key is missing, but only `console.error`s on a `pk_test_` key in a prod build — that guard must never throw at module scope (a throwing version white-screened darvis.tech on 2026-09-05, fixed in `b19814e`).
- `frontend/src/App.jsx` — root component, page routing (`page` state, no router lib), global dark mode. Only `/privacy` and `/terms` map to real URLs (`pageToPath`/`pathToPage` + `vercel.json` rewrites); every other page lives at `/` and the last page is restored from localStorage. Defines `PROTECTED` (pages that need sign-in) and `UPCOMING_PRODUCTS` (Kairo, Ruvo, Watchlist — sidebar entries that open `locked-product.jsx` instead of a page).
- `frontend/src/api.js` — most Supabase calls (`dashboard-prof.jsx`, `forums.jsx`, `instructors.jsx`, `profile-modal.jsx` query the `db` client directly instead).
- `frontend/src/config.js` — Supabase URL + publishable key; chatbot API URL (`VITE_CHAT_API_URL` override → `http://127.0.0.1:8000/chat` on localhost → the Render URL); the `CYRUS_PUBLIC_LAUNCHED` / `CYRUS_ALLOWLIST` gate flags.
- `frontend/src/supabase.js` — Supabase client singleton with a custom `fetch` that forwards the Clerk JWT (template `supabase`) so RLS can enforce ownership.
- `frontend/src/theme.jsx` — dark/light tokens plus shared helpers (`palette`, `glassCard`, `useIsMobile`, `PageHeader`).
- `frontend/src/mock-data.js` — `courses.jsx` uses it as a constants bag (`MOCK.gradeColors`, `MOCK.pathwaysOptions`), but `dashboard-prof.jsx`'s schedule-summary block still resolves sections through `MOCK.sections`/`getCourse`/`getProf`/`formatTime` — a real mock-data dependency in a production component, not yet migrated to `api.js`.
- `frontend/public/` — every file is referenced: `darvis-logo.png`, `cyrus-logo-stable.png`, `kairo/ruvo/watchlist-logo.png`, `favicon.ico`, `apple-touch-icon.png`, `images/` (campus_day/night.jpg landing backgrounds, virginia-tech-seal.webp).

**Components (`src/components/`):**
| File | Page/feature |
|------|-------------|
| `landing.jsx` | Public marketing/landing page |
| `courses.jsx` | Grade distribution browser + filters |
| `instructors.jsx` | Professor listing with RMP ratings |
| `dashboard-prof.jsx` | Professor detail view |
| `schedule.jsx` | Schedule builder (Fall 2026 sections) |
| `chatbot.jsx` | Cyrus chat UI — streams via `POST /chat/stream` (SSE), falls back to `POST /chat`; posts to `/feedback`; shows `CyrusLockedScreen` unless the user is allowlisted |
| `cyrus-logo.jsx` | Cyrus logo button used by `chatbot.jsx` |
| `forums.jsx` | Community forum (CRUD on `forum_posts`/`forum_replies` with RLS) — effectively empty, no users yet |
| `profile-page.jsx` | LinkedIn-style profile (posts, experience, education) + client-side LinkedIn "Save to PDF" parser (`pdfjs-dist`) |
| `profile-modal.jsx` | Profile edit modal |
| `nav-auth.jsx` | Top nav with Clerk sign-in/out |
| `auth-modal.jsx` | Sign-in prompt modal (page-label map for `pendingPage`) |
| `locked-product.jsx` | "Coming soon" modal for `UPCOMING_PRODUCTS` |
| `faqs.jsx` / `legal-page.jsx` | FAQ page / privacy + terms |
| `skeletons.jsx` / `icons.jsx` | Loading skeletons / shared SVG icons |
| `app-shell.jsx` | Outer shell — sidebar `navItems` + `Icons`, mobile drawer, bottom nav, page container |

**Auth:** Clerk. Only the chatbot page is auth-gated — `PROTECTED = new Set(["chatbot"])`; `navigateTo()` redirects signed-out users to landing and opens `auth-modal.jsx`. Courses, instructors, schedule, forums, FAQs and profile open signed-out; write actions (Echo reviews, profile/course posts) prompt sign-in via an `onRequireSignIn` prop, and forums hide the composer when signed out. Waitlist mode is set in the Clerk dashboard (Configure → Restrictions → Sign-up mode).

**Cyrus access gate:** separately from the Clerk waitlist, `CYRUS_PUBLIC_LAUNCHED = false` plus a two-email `CYRUS_ALLOWLIST` in `config.js` show most signed-in users a locked screen. Flip the flag (and clear the allowlist) to launch.

**Adding a page:** add a `renderPage()` branch + import in `App.jsx`; add `{ id, label, icon }` to `navItems` and an SVG to `Icons` in `app-shell.jsx` (the mobile drawer reuses `navItems`; the 4-tab bottom bar is fixed); add the label to `auth-modal.jsx`'s page map; for Kairo/Ruvo also delete their `UPCOMING_PRODUCTS` entry, which otherwise intercepts navigation. A real URL additionally needs `pageToPath`/`pathToPage` entries and a `vercel.json` rewrite.

## Chatbot (Cyrus)

FastAPI backend in Python. Loads Supabase data at startup into Pandas DataFrames (plus precomputed `DataIndexes`). Each question runs through `_run_chat_pipeline()` in `main.py`: a rule-based safety classifier (`safety/refusals.py`), a deterministic-professor pre-planner that can bypass the LLM, then `QueryPlanner` (`rag/query_planner.py`) — primarily LLM-driven, but on low confidence or LLM failure it falls through to `_deterministic_fallback_plan()`, an intentional ~130-line keyword/regex router, before returning a bare clarification request for a small set of ambiguous phrases. Then a fuzzy `EntityResolver`, a sufficiency gate (`check_plan`), the feature handler, and a templated or LLM answer. Responses are JSON: `answer`, `tables`, `charts`, `warnings`, `metadata`, `schedule_actions`. `schedule_builder.py` folds VT registrar checksheet roadmaps (`roadmap_courses`) into required-course ranking once major + year are known; if year is unknown it asks inline and recovers the original request from history on the follow-up.

```bash
cd chatbot
source .venv/bin/activate
uvicorn app.main:app --reload   # http://127.0.0.1:8000  (port busy: lsof -ti:8000 | xargs kill -9)
python -m pytest tests/         # 13 files, 245 tests, all passing as of 2026-10-08
```

Tests cover compound-constraint fixes, Cyrus eval graders, entity-retrieval guards, generation provider routing, model router, normalization, planner/critic, RAG refactor, reranker, retrieval eval, safety refusals, schedule-builder year resolution and structured generation. No `pytest.ini`/`pyproject.toml`; `chatbot/conftest.py` only adds the repo root to `sys.path` (so tests can import `evals/`). The venv is Python 3.14 (no pinned version file).

**Deploy:** push to `main` → Render auto-deploys (root directory `chatbot/`). Render free tier spins down after 15 idle minutes and the next request waits about a minute (Render docs, checked 2026-09-30); Starter ($7/month) removes cold starts.

**Env vars (`chatbot/.env`)** — minimum set; `chatbot/.env.example` documents all ~40 (OpenAI Luna/Terra/Sol tiers, `CYRUS_MODEL_ROUTING_ENABLED`, local reranker, RAG tuning, `RAG_DEBUG_MODE`, `DEV_FEEDBACK_TOKEN`):
```
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b
SUPABASE_URL=...
SUPABASE_KEY=...                  # service role key
REDIS_URL=...                     # Redis Stack / Redis Cloud (redisvl)
RAG_REDIS_INDEX_NAME=darvis_embeddings
RAG_ENABLE_LLM_JUDGE=true         # LLM judges borderline retrieval quality
CURRENT_TERM=202609               # optional; CURRENT_TERM_LABEL="Fall 2026"
ALLOWED_ORIGINS=https://darvis.tech,...
SHOW_DOCS=true                    # local only — enables /docs, /redoc, /openapi.json (all 404 in prod)
```

**LLM:** Groq `openai/gpt-oss-120b` via the OpenAI-compatible client; the class/file keep the legacy names `GemmaAnswerClient`/`rag/gemma_client.py`. Temperature 0.2 (0.1 for raw/planner calls), `reasoning_effort="low"`, 30 s timeout, returns `None` on any failure → `features/templated_answers.py`. History: Anthropic → Groq, briefly reverted by a bad merge (`e0904af`), restored in `cbdf7db`. Groq free-tier limits for this model are organization-wide: 30 req/min, 1K req/day, 8K tokens/min, 200K tokens/day (Groq docs, checked 2026-09-30).

**Retrieval:** Redis (redisvl) hybrid search — vector KNN + RediSearch full-text, fused with RRF — over 384-dim fastembed embeddings; reranker runs in passthrough mode (`/health`, 2026-09-29: 36,210 vectors). Supabase `embeddings` is the durable source of truth: after rebuilding it, or whenever Redis is cold, run `python -m scripts.rebuild_embeddings --wipe` then `python -m scripts.sync_redis_index`. Check `/health`'s `vector_records` before assuming the index is stale.

**Endpoints (`main.py`):**
| Method | Path | Rate limit | Description |
|--------|------|-----------|-------------|
| `POST` | `/chat` | 10/min per IP | Main chatbot — answer, tables, charts |
| `POST` | `/chat/stream` | 10/min per IP | Server-Sent-Events variant of `/chat` |
| `POST` | `/feedback` | 30/min per IP | Thumbs up (`rating=1`) / down (`-1`), optional `reason` |
| `GET` | `/feedback/recent` | 20/min per IP | Internal review — requires `X-Darvis-Dev-Token` = `DEV_FEEDBACK_TOKEN` |
| `GET` | `/courses/search` | 60/min per IP | Typeahead course search |
| `GET` | `/professors/search` | 60/min per IP | Typeahead professor search |
| `GET` | `/rmp/reviews` | 30/min per IP | Live proxy to RateMyProfessors' GraphQL API |
| `POST` | `/retrieval/debug` | 30/min per IP | Retrieval telemetry — 404 unless `RAG_DEBUG_MODE=true` |
| `GET` | `/health` | none | Loaded row counts + vector store status |
| `GET` | `/ping` | none | Render keepalive |

**Request flow:**
```
POST /chat  (_run_chat_pipeline() in main.py — this is the shape, not every branch)
  → classify_safety (safety/refusals.py)        # FIRST gate: blocks prompt/secret extraction, private records, destructive requests
  → normalize_question (safety/guardrails.py)   # whitespace/quote cleanup only; the LLM handles typos
  → prompt-injection / workload / curve-question short-circuits
  → deterministic-professor pre-planner OR QueryPlanner.plan (rag/query_planner.py)
  → EntityResolver (safety/entity_resolver.py)  # fuzzy-correct professor/course names
  → check_plan (rag/verifier.py)                # sufficiency gate — honest "we don't have that" for known data gaps
  → handler (features/*.py)                     # optional secondary route via _SECONDARY_ROUTE_PAIRS; its failures never break the primary answer
  → sanitize_answer (safety/guardrails.py)
  → ChatResponse                                # + eval_trace when body.eval_mode is set (used by evals/)
```

**Routes:**
| Route | Triggered when | Handler |
|-------|---------------|---------|
| `course_profile` | Course code present ("CS 3114") | `course_profile.py` |
| `professor_profile` | Professor name or "professor" keyword | `professor_profile.py` |
| `natural_filter` | Ranking/filter language ("highest GPA", "worst F rate") | `natural_filter.py` |
| `major_requirements` | Graduation/degree requirement phrases | `major_requirements.py` |
| `schedule_builder` | "Build me a schedule" phrases | `schedule_builder.py` |
| `section_lookup` | Timetable phrasing ("who is teaching CS 3114", times/days/seats/location) | `section_lookup.py` |
| `out_of_scope` | `OUT_OF_SCOPE_TERMS` match (list currently empty — disabled) | Canned response |
| `general_rag` | Everything else | `general_chat.py` |

**File map (`chatbot/app/`):**
```
main.py                App factory, lifespan loader, STATE global (the real DI container), all routes, _run_chat_pipeline()
config.py / models.py  Pydantic settings from env / request + response models (ChatRequest, ChatResponse, FeedbackRequest, ...)
data/                  loader.py (Supabase batch fetchers + _RENAME map), analytics.py (Pandas core), indexes.py (DataIndexes O(1) lookups), recency.py
features/              router.py (keyword helpers), course_profile, professor_profile, natural_filter, general_chat, major_requirements,
                       schedule_builder, section_lookup (Fall 2026 sections; live Supabase fallback), templated_answers (LLM-down fallbacks)
rag/                   gemma_client (Groq), query_planner + planner_models (QueryPlan), verifier (check_plan), retriever + redis_schema
                       (Redis hybrid search), vector_store (Pandas keyword fallback + Redis), embedder (OpenAI → fastembed), chunker
                       (used by scripts/rebuild_embeddings), reranker, query_rewriter, pipeline + agentic_pipeline + agents/ (planner → retrieve
                       → critic), observability, prompts
safety/                refusals (first gate), guardrails (SYSTEM_GUARDRAIL, normalize_question, sanitize_answer), entity_resolver, privacy
generation/            OpenAI Luna/Terra/Sol structured generation with cost-first routing — NOT imported by main.py; used only by
                       evals/run.py --generation-only and tests (CYRUS_MODEL_ROUTING_ENABLED=false)
utils/charts.py        table_spec, bar_chart, scatter_chart builders
```

**Analytics (`data/analytics.py`):** `course_profile`, `professor_profile`, `natural_filter`, `detect_natural_params`, `extract_course_parts`. DataFrame columns use the original VT UDC CSV headers (`"Course No."`, `"A (%)"`, `"Graded Enrollment"`); `_RENAME` in `loader.py` maps Supabase snake_case to them.

**Scripts (`chatbot/scripts/`, run as `python -m scripts.<name>` from `chatbot/`):**
- `rebuild_embeddings.py` — chunk + embed every source into Supabase `embeddings` (`--wipe`, `--force`, `--dry-run`, `--source <name>`).
- `sync_redis_index.py` — load Supabase `embeddings` into the Redis index retrieval queries.
- `scrape_curriculum.py` — catalog.vt.edu graduation requirements → `majors` + `major_requirements` (also writes a gitignored `catalog_data_backup.json`).
- `scrape_checksheets.py` — registrar checksheet PDFs → `roadmap_courses`. Needs `pdfplumber`, `beautifulsoup4`, `lxml`, which are NOT in `requirements.txt`. Coverage is partial by design (some PDFs use non-extractable fonts).

**Migrations (`chatbot/migrations/`):** 7 SQL files (`001`–`005` + two dated index/function files), run by hand in the Supabase SQL editor. `003_echo_reviews.sql` is the RLS template: `user_id TEXT` holds the Clerk id, policies check `auth.uid()::text = user_id`.

**Evals (`evals/`):** `run.py` has three modes — `--end-to-end` (calls a live `/chat` endpoint), `--retrieval-only` (shells out to `run_reranker_ab.py`, so keep that file), `--generation-only` (grades `fixtures/generation/` through `app/generation` without retrieval). Inputs: `datasets/` (6 JSONL suites), `graders/deterministic.py`. Outputs go to `evals/reports/` (gitignored). `thresholds.yaml` records the release gates (exact entity match 1.00, retrieval P@5 0.90, nDCG@5 0.85, answer-type accuracy 0.98, …) — documentation only, no code reads it.

## Backend (Node data scripts)

Not a server. CommonJS; deps `@supabase/supabase-js`, `puppeteer`, `cheerio`, `dotenv`. Setup: `cd backend && npm install && cp .env.example .env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

```
backend/
├── scrapers/
│   ├── udc_2020_present_scraper.js  Browser console on udc.vt.edu grades page: all subjects × courses 2020-21→2025-26, downloads vt_grades_<from>_to_<to>.csv
│   ├── udc_playwright_scraper.js    Headless alternative (uses Puppeteer despite the name): per-subject vt_udc_grades_*.csv, resumable via data/progress/
│   ├── banner_puppeteer_scraper.js  Authenticated Banner scrape (instructors + seats) → upserts sections; run by CI
│   ├── banner_auth_helper.js        Interactive CAS/Duo login — saves the browser profile the scraper reuses
│   ├── banner_timetable_scraper.js  Banner timetable without login → vt_timetable_*.csv (fallback)
│   ├── rmp_scraper.js               RMP GraphQL → data/raw/rmp_vt_professors.json
│   ├── catalog_scraper.js           catalog.vt.edu descriptions → data/raw/course_descriptions.json
│   ├── prereq_scraper.js            catalog.vt.edu prerequisites → data/raw/course_prerequisites.json
│   └── pathways_scraper.js          catalog.vt.edu Pathways codes → data/raw/course_pathways.json
├── scripts/
│   ├── import_all_grades.js    data/raw/vt_grade_distribution_2020-21_to_2025-26.csv → grades, then the aggregate_courses() RPC fills course stats
│   ├── import_grades.js        data/raw/vt_udc_grades_*.csv (per subject) → grades + course aggregation
│   ├── import_timetable.js     data/raw/vt_timetable_*.csv → sections
│   ├── import_descriptions.js  course_descriptions.json → courses.description
│   ├── import_prerequisites.js course_prerequisites.json → courses.prerequisites
│   ├── import_pathways.js      course_pathways.json → courses.pathways
│   ├── rebuild_instructors.js  sections names + grades stats + rmp_vt_professors.json (last-name match) → instructors
│   └── update_banner_secret.sh Re-encodes local Banner cookies → GitHub secret BANNER_PROFILE_B64
├── supabase/schema.sql         PARTIAL schema: grades, courses, professors, sections, profile_posts, echo_reviews only
└── data/                       raw/ inputs, progress/ scraper resume state, browser-profile/ Banner cookies — all gitignored except raw/.gitkeep
```

The UDC page is a PrimeVue SPA, which is why the main grade scraper is a paste-into-DevTools script. Its download name (`vt_grades_...csv`) differs from what `import_all_grades.js` reads (`vt_grade_distribution_2020-21_to_2025-26.csv`) — rename the file in `data/raw/` first. Grades for 2020-21 → 2025-26 are fully imported; re-scrape only when VT publishes a new academic year (both scrapers hardcode the year range).

```bash
cd backend
node scripts/import_all_grades.js   # combined CSV → grades + course stats
npm run scrape-grades               # headless per-subject scrape → npm run import-grades
npm run import-timetable            # after dropping vt_timetable_*.csv in data/raw/
npm run scrape-catalog && npm run import-descriptions
npm run scrape-prereqs && npm run import-prerequisites
npm run scrape-pathways && npm run import-pathways
npm run scrape-timetable            # Banner timetable without login
npm run auth-banner                 # interactive CAS/Duo login — saves the Banner browser profile
npm run scrape-timetable-auth       # authenticated scrape — instructors + seats
npm run update-banner-secret        # push refreshed cookies to GitHub secret BANNER_PROFILE_B64
node scrapers/rmp_scraper.js && node scripts/rebuild_instructors.js
```

**CI (`.github/workflows/update-timetable.yml`):** every 4 h (cron `0 */4 * * *`) + manual dispatch. Node 22, restores Chrome cookies from secret `BANNER_PROFILE_B64`, runs `banner_puppeteer_scraper.js` with `NO_DELETE=true HEADLESS=true`. Secrets: `BANNER_PROFILE_B64`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The scraper skips subjects listed in `data/progress/banner_timetable_progress.json`; that file used to be committed with all 151 subjects marked done, so CI scraped nothing. It was untracked on 2026-10-08, so every CI run now scrapes all subjects. The repo is public, so Actions minutes are free.

## Supabase database

Project ID `rpmgcurhxrgtzbdixtay`. Row counts verified 2026-07-01 unless noted.

| Table | Rows | Notes |
|-------|------|-------|
| `grades` | 59,790 | All 152 subjects, 2020–2026 — full UDC import |
| `courses` | 6,589 | 5,468 have `avg_gpa`; 5,051 `description`, 1,153 `prerequisites`, 751 `pathways` |
| `sections` | 10,663 | Fall 2026 (term `202609`); last refreshed 2026-07-01 — see Known issues |
| `instructors` | 3,834 | 1,982 with RMP ratings; `rmp_tags` empty for all (RMP API limitation). Read by frontend and chatbot |
| `professors` | 65 | Legacy, read by nothing and written by nothing since `import_rmp.js` was removed — safe to drop |
| `majors` / `major_requirements` | 183 / 16,290 | From `scrape_curriculum.py` |
| `roadmap_courses` | — | `005_roadmap_courses.sql`; `major_name` (plain text, not FK'd), `year_number`, `semester`, `course_code` from `scrape_checksheets.py`; feeds `schedule_builder.py` |
| `embeddings` | 4,576 at last snapshot | Source of truth for the Redis index, which held 36,210 vectors on 2026-09-29. Legacy `search_embeddings`/`hybrid_search` RPCs remain in the schema, unused |
| `grade_embeddings` | 0 | Dead — safe to drop |
| `feedback` | — | Written by `POST /feedback`; `reason` column from `004_feedback_reason.sql` |
| `echo_reviews` | — | `003_echo_reviews.sql`; read/written by `api.js`, served by `GET /rmp/reviews` |
| `forum_posts` / `forum_replies` | 1 / 0 | Forums page |
| `profile_posts` | — | `api.js` createPost/getPosts/deletePost; defined in `backend/supabase/schema.sql` |
| `user_schedules` / `user_conversations` | — | `api.js` saved schedules / Cyrus chat history; not in any checked-in schema or migration |

No single file defines the whole live schema: `backend/supabase/schema.sql` covers six tables and `chatbot/migrations/` covers part of the rest.

## Known issues and pending work

**High priority:**
- Timetable CI has failed on every run since at least 2026-08-14: Banner SSO auto-renewal fails, so `sections` (seats, instructors) is frozen at 2026-07-01. Fix from `backend/`: `node scrapers/banner_puppeteer_scraper.js` (headed, approve Duo), then `npm run update-banner-secret`. The Duo cookie lasts ~30 days, so expect to repeat this monthly.
- `courses.avg_gpa` is null for 1,121 of 6,589 courses (no grade rows for them).

**Medium priority:**
- Cyrus is still allowlist-gated (`CYRUS_PUBLIC_LAUNCHED=false`).
- Vercel's `VITE_CLERK_PUBLISHABLE_KEY` is a `pk_test_` key, so darvis.tech authenticates against Clerk's test instance — swap to `pk_live_`.
- `scrape_checksheets.py` deps (`pdfplumber`, `beautifulsoup4`, `lxml`) are missing from `chatbot/requirements.txt`.
- `chatbot/app/generation/` is built and tested but not wired into `/chat` (`CYRUS_MODEL_ROUTING_ENABLED=false`) — wire it in or remove it along with the `--generation-only` eval mode.

**Low priority:**
- Drop the dead `grade_embeddings` and legacy `professors` tables.
- `rmp_tags` stays empty — RMP's GraphQL API doesn't return `teacherRatingTags`. Accepted.
- `dashboard-prof.jsx` still reads sections from `mock-data.js`.
- `README.md` restates the stack, setup and pending work for a public audience — update it when those change here.

## Git and PR conventions

- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`). Older history uses plain sentence-case subjects.
- **Branches:** `claude/<topic>` for Claude Code work. Older `codex/<topic>` branches came from Codex, which is no longer used. `main` is the default and deploy branch — every push auto-deploys the frontend (Vercel) and chatbot (Render), so never push unfinished work to `main`.
- **Merges:** GitHub PRs into `main` with merge commits (not squash); remote `B2B-VT/Darvis`. `claude/*` branches have also been merged locally with `git merge` and pushed without a PR.

## Deployment

| Service | What | URL |
|---------|------|-----|
| Vercel | Frontend | https://darvis.tech |
| Render | Chatbot FastAPI | https://chat-bot-6dpo.onrender.com |
| Supabase | Database | project `rpmgcurhxrgtzbdixtay` |
| Redis Cloud | Vector + keyword index (redisvl) | synced from Supabase `embeddings` |
| Clerk | Auth | clerk.darvis.tech |
| GitHub Actions | Timetable refresh every 4 h | `.github/workflows/update-timetable.yml` |

## What not to break

- `SYSTEM_GUARDRAIL` in `safety/guardrails.py`: advisor tone — lead with the insight, support with numbers. Never revert to "Based on historical grade data..." phrasing.
- `_RENAME` in `data/loader.py`: analytics expects the original VT UDC column names. Change both or neither.
- Rate limits in `main.py`: `/chat` stays at 10 requests/minute per IP.
- CORS: `ALLOWED_ORIGINS` must include `https://darvis.tech`.
- `features/templated_answers.py`: every handler must return a string when the LLM is down — never `None`.
- `frontend/src/main.jsx` env-key guard runs at module scope: warn on `pk_test_`, never throw (2026-09-05 outage).
- `frontend/src/supabase.js` custom `fetch` that injects the Clerk JWT: `profile_posts`, `user_schedules`, `user_conversations`, `echo_reviews` and the forum tables rely on it for RLS. Don't replace `db` with a bare `createClient`.
- `evals/run_reranker_ab.py`: looks like a one-off experiment, but `evals/run.py --retrieval-only` depends on it.

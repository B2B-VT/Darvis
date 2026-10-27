# Darvis — Claude Code context

Darvis is a live Virginia Tech academic intelligence platform at darvis.tech. Students use it to look up grade distributions, compare professors, build schedules, and ask the AI chatbot ("Cyrus") questions like "which CS 3114 professor has the strongest outcomes?" Auth is handled by Clerk (waitlist/beta mode). Built and maintained by Pujan Patel.

This is the only CLAUDE.md in the repo, and `README.md` is the only README. On 2026-10-08 the repo was purged of dead code, generated eval outputs, finished design docs (`docs/`), the old workbook QA harness, Codex config (`AGENTS.md`, `.codex/`) and duplicate media; `.github/` (timetable CI, CODEOWNERS) followed on 2026-10-09. Anything removed is recoverable from git history. `AGENTS.md` came back on 2026-10-12 (`287d359`) as a find-and-replace Codex copy of this file; nothing keeps the two in sync.

## Frontend

React 19.2 + Vite 8 (`@vitejs/plugin-react` 6). Clerk via `@clerk/clerk-react` 5, Supabase via `@supabase/supabase-js` 2, `chart.js` 4 for chatbot charts, `pdfjs-dist` solely for the LinkedIn-PDF profile import in `profile-page.jsx`. Styles are CSS-in-JS inline objects — no Tailwind, no CSS modules. No `.nvmrc`/`engines`; local dev runs Node 24. No ESLint/Prettier and no test runner — plain JS, manual formatting — so `npm run build` is the only automated check. Its >500 kB chunk warning is expected: the app ships as one ~1.1 MB chunk plus the 1.26 MB pdf.js worker.

**Deploy:** push to `main` → Vercel auto-deploys.

**Mock data gotcha:** `frontend/src/mock-data.js` — `courses.jsx` uses it as a constants bag (`MOCK.gradeColors`, `MOCK.pathwaysOptions`), but `dashboard-prof.jsx`'s schedule-summary block still resolves sections through `MOCK.sections`/`getCourse`/`getProf`/`formatTime` — a real mock-data dependency in a production component, not yet migrated to `api.js`.

**Auth:** Clerk. Only the chatbot page is auth-gated — `PROTECTED = new Set(["chatbot"])`; `navigateTo()` redirects signed-out users to landing and opens `auth-modal.jsx`. Courses, instructors, schedule, forums, FAQs and profile open signed-out; write actions (Echo reviews, profile/course posts) prompt sign-in via an `onRequireSignIn` prop, and forums hide the composer when signed out. Waitlist mode is set in the Clerk dashboard (Configure → Restrictions → Sign-up mode).

**Cyrus access gate:** separately from the Clerk waitlist, `CYRUS_PUBLIC_LAUNCHED = false` plus a two-email `CYRUS_ALLOWLIST` in `config.js` show most signed-in users a locked screen. Flip the flag (and clear the allowlist) to launch.

**Adding a page:** add a `renderPage()` branch + import in `App.jsx`; add `{ id, label, icon }` to `navItems` and an SVG to `Icons` in `app-shell.jsx` (the mobile drawer reuses `navItems`; the 4-tab bottom bar is fixed); add the label to `auth-modal.jsx`'s page map; for Kairo/Ruvo also delete their `UPCOMING_PRODUCTS` entry, which otherwise intercepts navigation. A real URL additionally needs `pageToPath`/`pathToPage` entries and a `vercel.json` rewrite.

## Chatbot (Cyrus)

FastAPI backend in Python. Loads Supabase data at startup into Pandas DataFrames (plus precomputed `DataIndexes`). Each question runs through `_run_chat_pipeline()` in `main.py`: a rule-based safety classifier (`safety/refusals.py`), a deterministic-professor pre-planner that can bypass the LLM, then `QueryPlanner` (`rag/query_planner.py`) — primarily LLM-driven, but on low confidence or LLM failure it falls through to `_deterministic_fallback_plan()`, an intentional ~130-line keyword/regex router, before returning a bare clarification request for a small set of ambiguous phrases. Then a fuzzy `EntityResolver`, a sufficiency gate (`check_plan`), the feature handler, and a templated or LLM answer. Responses are JSON: `answer`, `tables`, `charts`, `warnings`, `metadata`, `schedule_actions`. `schedule_builder.py` folds VT registrar checksheet roadmaps (`roadmap_courses`) into required-course ranking once major + year are known; if year is unknown it asks inline and recovers the original request from history on the follow-up.

**Endpoints:** the Cyrus UI posts to `/chat/stream` and falls back to `/chat`. The stream runs `_run_chat_pipeline()` to completion, then replays the answer as SSE `status` → `route` → `answer_chunk` → `final` events, so it isn't token streaming. `/ping` is the keep-warm target; `/health` reports per-table `*_loaded` counts and `vector_records`. `load_roadmap_from_supabase()` logs a warning and returns an empty DataFrame on any error, so roadmap ranking turns off without failing anything.

**Tests:** `cd chatbot && .venv/bin/python -m pytest tests/` runs 245 offline tests in under a second (2026-10-27); the one `TestClient` call skips `lifespan`, so nothing touches Supabase. `pytest` isn't in `requirements.txt`, and the repo pins no Python version (the local `.venv` runs 3.14).

**Deploy:** push to `main` → Render auto-deploys (root directory `chatbot/`). Render free tier spins down after 15 idle minutes and the next request waits about a minute (Render docs, checked 2026-09-30); Starter ($7/month) removes cold starts.

**LLM:** Groq `openai/gpt-oss-120b` via the OpenAI-compatible client; the class/file keep the legacy names `GemmaAnswerClient`/`rag/gemma_client.py`. Temperature 0.2 (0.1 for raw/planner calls), `reasoning_effort="low"`, 30 s timeout, returns `None` on any failure → `features/templated_answers.py`. History: Anthropic → Groq, briefly reverted by a bad merge (`e0904af`), restored in `cbdf7db`. Groq free-tier limits for this model are organization-wide: 30 req/min, 1K req/day, 8K tokens/min, 200K tokens/day (Groq docs, checked 2026-09-30).

**Retrieval:** Redis (redisvl) hybrid search — vector KNN + RediSearch full-text, fused with RRF — over 384-dim fastembed embeddings; reranker runs in passthrough mode (`/health`, 2026-10-27: 36,210 vectors). Supabase `embeddings` is the durable source of truth: after rebuilding it, or whenever Redis is cold, run `python -m scripts.rebuild_embeddings --wipe` then `python -m scripts.sync_redis_index`. Check `/health`'s `vector_records` before assuming the index is stale.

**Migrations (`chatbot/migrations/`):** 7 SQL files (`001`–`005` + two dated index/function files), run by hand in the Supabase SQL editor. `003_echo_reviews.sql` shows the ownership pattern (`user_id TEXT` holds the Clerk id), but don't copy its `auth.uid()::text = user_id` checks, which `schema.sql` repeats: `auth.uid()` casts the JWT `sub` to `uuid`, and Clerk ids (`user_…`) aren't UUIDs, so those policies error on every signed-in write. Compare against `(select auth.jwt()->>'sub')`, as Clerk's Supabase guide does.

## Backend (Node data scripts)

The UDC page is a PrimeVue SPA, which is why the main grade scraper is a paste-into-DevTools script. Its download name (`vt_grades_...csv`) differs from what `import_all_grades.js` reads (`vt_grade_distribution_2020-21_to_2025-26.csv`) — rename the file in `data/raw/` first. Grades for 2020-21 → 2025-26 are fully imported; re-scrape only when VT publishes a new academic year (both scrapers hardcode the year range).

**Timetable refresh is manual.** The 4-hourly GitHub Actions scrape was deleted on 2026-10-09 (`83c1a73`). From `backend/`, `node scrapers/banner_puppeteer_scraper.js` runs headed so you can approve Duo; `HEADLESS=true` then reuses the saved `data/browser-profile/`. Without `NO_DELETE=true`, a fresh run first deletes every `sections` row for the term. The scraper records finished subjects in `data/progress/banner_timetable_progress.json` and never clears it, so delete that file before each full refresh, or the run skips every subject (this is what once made CI scrape nothing). `npm run update-banner-secret` only fed the deleted workflow's `BANNER_PROFILE_B64` secret. `npm run scrape-grades` runs `udc_playwright_scraper.js`, which uses Puppeteer despite its name.

## Term rollover

The current term (`202609`, Fall 2026) lives in several places; change them together:

- **Chatbot:** `CURRENT_TERM` and `CURRENT_TERM_LABEL` env vars on Render (read by `loader.py`, `schedule_builder.py`, `section_lookup.py`, `sync_redis_index.py`).
- **Frontend:** `CURRENT_SECTIONS_TERM` and three more `'202609'` literals in `api.js`.
- **Scrapers:** `TERM` and the `case "202609"` regex in `banner_puppeteer_scraper.js` and `banner_timetable_scraper.js`, plus the count check in `import_timetable.js`.
- **Copy:** "Fall 2026" strings that ignore `CURRENT_TERM_LABEL` across `chatbot/app/` and `courses.jsx` (`git grep -n "Fall 2026"`); `tests/test_rag_refactor.py` asserts on some of them.

Then reload `sections` and run `python -m scripts.sync_redis_index`, which embeds only current-term sections. `backend/data/spring_2027_sections.csv` (term `202701`, scraped 2026-10-10) is committed, but no script reads it, and Supabase held no `202701` rows on 2026-10-27.

## Supabase database

Project ID `rpmgcurhxrgtzbdixtay`. Row counts verified 2026-10-27 through PostgREST unless noted.

| Table | Rows | Notes |
|-------|------|-------|
| `grades` | 59,790 | All 152 subjects, 2020–2026 — full UDC import |
| `courses` | 6,589 | 5,468 have `avg_gpa`; 5,051 `description`, 1,153 `prerequisites`, 751 `pathways` |
| `sections` | 10,663 | Fall 2026 (term `202609`); last refreshed 2026-07-01 — see Known issues |
| `instructors` | 3,834 | 1,982 with RMP ratings; `rmp_tags` empty for all (RMP API limitation). Read by frontend and chatbot |
| `majors` / `major_requirements` | 183 / 16,290 | From `scrape_curriculum.py` |
| `roadmap_courses` | **missing** | Defined in `005_roadmap_courses.sql` (`major_name` plain text, not FK'd; `year_number`, `semester`, `course_code`), filled by `scrape_checksheets.py`, read by `schedule_builder.py` — but PostgREST finds no such table (PGRST205), even with the service-role key, so roadmap ranking is off |
| `embeddings` | 28,625 | Source of truth for the Redis index (36,210 vectors on 2026-10-27); Redis also holds current-term section chunks that `sync_redis_index.py` builds straight from `sections`. Legacy `search_embeddings`/`hybrid_search` RPCs remain in the schema, unused |
| `feedback` | 0 | Written by `POST /feedback`; `reason` column from `004_feedback_reason.sql` |
| `echo_reviews` | **missing** | PGRST205, yet `api.js` reads and writes it, so Echo reviews fail in production. Defined in `003_echo_reviews.sql` and `schema.sql`. `GET /rmp/reviews` is unrelated: it proxies live RateMyProfessors GraphQL |
| `forum_posts` / `forum_replies` | 1 / 1 | Forums page |
| `profile_posts` | **missing** | PGRST205, so `api.js` createPost/getPosts/deletePost fail. Defined in `backend/supabase/schema.sql` |
| `user_schedules` / `user_conversations` | 19 / 109 | `api.js` saved schedules / Cyrus chat history; not in any checked-in schema or migration |

No single file defines the whole live schema: `backend/supabase/schema.sql` covers six tables and `chatbot/migrations/` covers part of the rest. The legacy `professors` and `grade_embeddings` tables are gone (PGRST205 on 2026-10-27), though `schema.sql` still defines `professors`.

## Known issues and pending work

**High priority:**
- `sections` (seats, instructors) is still frozen at 2026-07-01 (checked 2026-10-27), and nothing refreshes it since the CI workflow was deleted. Refresh by hand (see Backend); for Spring 2027 registration, do the term rollover first. The Duo cookie lasts ~30 days.
- `roadmap_courses`, `echo_reviews` and `profile_posts` are missing from the live DB, so roadmap-aware schedule ranking is off and Echo reviews and profile posts fail. Apply `005`, then `003` and the `profile_posts` block of `schema.sql` with their policies rewritten to `auth.jwt()->>'sub'`, then run `python -m scripts.scrape_checksheets`.
- `courses.avg_gpa` is null for 1,121 of 6,589 courses (no grade rows for them).

**Medium priority:**
- Cyrus is still allowlist-gated (`CYRUS_PUBLIC_LAUNCHED=false`).
- Vercel's `VITE_CLERK_PUBLISHABLE_KEY` is a `pk_test_` key (still in the live bundle on 2026-10-27), so darvis.tech authenticates against Clerk's test instance — swap to `pk_live_`.
- `scrape_checksheets.py` deps (`pdfplumber`, `beautifulsoup4`, `lxml`) are missing from `chatbot/requirements.txt`.
- `chatbot/app/generation/` is built and tested but not wired into `/chat` (`CYRUS_MODEL_ROUTING_ENABLED=false`) — wire it in or remove it along with the `--generation-only` eval mode.

**Low priority:**
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
| Vercel | Frontend | https://www.darvis.tech (the apex 307-redirects here) |
| Render | Chatbot FastAPI | https://chat-bot-6dpo.onrender.com |
| Supabase | Database | project `rpmgcurhxrgtzbdixtay` |
| Redis Cloud | Vector + keyword index (redisvl) | synced from Supabase `embeddings` |
| Clerk | Auth | clerk.darvis.tech |

## What not to break

- `SYSTEM_GUARDRAIL` in `safety/guardrails.py`: advisor tone — lead with the insight, support with numbers. Never revert to "Based on historical grade data..." phrasing.
- `_RENAME` in `data/loader.py`: analytics expects the original VT UDC column names. Change both or neither.
- Rate limits in `main.py`: `/chat` and `/chat/stream` stay at 10 requests/minute per IP.
- CORS: `ALLOWED_ORIGINS` must include `https://www.darvis.tech` (the browser's real origin, since the apex redirects there) and `https://darvis.tech`. Both passed preflight on 2026-10-27.
- `features/templated_answers.py`: every handler must return a string when the LLM is down — never `None`.
- `frontend/src/main.jsx` env-key guard runs at module scope: warn on `pk_test_`, never throw (2026-09-05 outage).
- `frontend/src/supabase.js` custom `fetch` that injects the Clerk JWT from `getToken({ template: "supabase" })` (keep that template name in the Clerk dashboard): `profile_posts`, `user_schedules`, `user_conversations`, `echo_reviews` and the forum tables rely on it for RLS. Don't replace `db` with a bare `createClient`.
- `evals/run_reranker_ab.py`: looks like a one-off experiment, but `evals/run.py --retrieval-only` depends on it.

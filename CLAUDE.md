# Darvis — Claude Code context

Darvis is a live Virginia Tech academic intelligence platform at darvis.tech. Students use it to look up grade distributions, compare professors, build schedules, and ask the AI chatbot ("Cyrus") questions like "which CS 3114 professor has the strongest outcomes?" Auth is handled by Clerk (waitlist/beta mode). Built and maintained by Pujan Patel.

This is the only CLAUDE.md in the repo, and `README.md` is the only README. On 2026-10-08 the repo was purged of dead code, generated eval outputs, finished design docs (`docs/`), the old workbook QA harness, Codex config (`AGENTS.md`, `.codex/`) and duplicate media. Anything removed is recoverable from git history.

## Frontend

React 19.2 + Vite 8 (`@vitejs/plugin-react` 6). Clerk via `@clerk/clerk-react` 5, Supabase via `@supabase/supabase-js` 2, `chart.js` 4 for chatbot charts, `pdfjs-dist` solely for the LinkedIn-PDF profile import in `profile-page.jsx`. Styles are CSS-in-JS inline objects — no Tailwind, no CSS modules. No `.nvmrc`/`engines`: local dev runs Node 24, CI runs Node 22. No ESLint/Prettier and no test runner — plain JS, manual formatting.

**Deploy:** push to `main` → Vercel auto-deploys.

**Mock data gotcha:** `frontend/src/mock-data.js` — `courses.jsx` uses it as a constants bag (`MOCK.gradeColors`, `MOCK.pathwaysOptions`), but `dashboard-prof.jsx`'s schedule-summary block still resolves sections through `MOCK.sections`/`getCourse`/`getProf`/`formatTime` — a real mock-data dependency in a production component, not yet migrated to `api.js`.

**Auth:** Clerk. Only the chatbot page is auth-gated — `PROTECTED = new Set(["chatbot"])`; `navigateTo()` redirects signed-out users to landing and opens `auth-modal.jsx`. Courses, instructors, schedule, forums, FAQs and profile open signed-out; write actions (Echo reviews, profile/course posts) prompt sign-in via an `onRequireSignIn` prop, and forums hide the composer when signed out. Waitlist mode is set in the Clerk dashboard (Configure → Restrictions → Sign-up mode).

**Cyrus access gate:** separately from the Clerk waitlist, `CYRUS_PUBLIC_LAUNCHED = false` plus a two-email `CYRUS_ALLOWLIST` in `config.js` show most signed-in users a locked screen. Flip the flag (and clear the allowlist) to launch.

**Adding a page:** add a `renderPage()` branch + import in `App.jsx`; add `{ id, label, icon }` to `navItems` and an SVG to `Icons` in `app-shell.jsx` (the mobile drawer reuses `navItems`; the 4-tab bottom bar is fixed); add the label to `auth-modal.jsx`'s page map; for Kairo/Ruvo also delete their `UPCOMING_PRODUCTS` entry, which otherwise intercepts navigation. A real URL additionally needs `pageToPath`/`pathToPage` entries and a `vercel.json` rewrite.

## Chatbot (Cyrus)

FastAPI backend in Python. Loads Supabase data at startup into Pandas DataFrames (plus precomputed `DataIndexes`). Each question runs through `_run_chat_pipeline()` in `main.py`: a rule-based safety classifier (`safety/refusals.py`), a deterministic-professor pre-planner that can bypass the LLM, then `QueryPlanner` (`rag/query_planner.py`) — primarily LLM-driven, but on low confidence or LLM failure it falls through to `_deterministic_fallback_plan()`, an intentional ~130-line keyword/regex router, before returning a bare clarification request for a small set of ambiguous phrases. Then a fuzzy `EntityResolver`, a sufficiency gate (`check_plan`), the feature handler, and a templated or LLM answer. Responses are JSON: `answer`, `tables`, `charts`, `warnings`, `metadata`, `schedule_actions`. `schedule_builder.py` folds VT registrar checksheet roadmaps (`roadmap_courses`) into required-course ranking once major + year are known; if year is unknown it asks inline and recovers the original request from history on the follow-up.

**Deploy:** push to `main` → Render auto-deploys (root directory `chatbot/`). Render free tier spins down after 15 idle minutes and the next request waits about a minute (Render docs, checked 2026-09-30); Starter ($7/month) removes cold starts.

**LLM:** Groq `openai/gpt-oss-120b` via the OpenAI-compatible client; the class/file keep the legacy names `GemmaAnswerClient`/`rag/gemma_client.py`. Temperature 0.2 (0.1 for raw/planner calls), `reasoning_effort="low"`, 30 s timeout, returns `None` on any failure → `features/templated_answers.py`. History: Anthropic → Groq, briefly reverted by a bad merge (`e0904af`), restored in `cbdf7db`. Groq free-tier limits for this model are organization-wide: 30 req/min, 1K req/day, 8K tokens/min, 200K tokens/day (Groq docs, checked 2026-09-30).

**Retrieval:** Redis (redisvl) hybrid search — vector KNN + RediSearch full-text, fused with RRF — over 384-dim fastembed embeddings; reranker runs in passthrough mode (`/health`, 2026-09-29: 36,210 vectors). Supabase `embeddings` is the durable source of truth: after rebuilding it, or whenever Redis is cold, run `python -m scripts.rebuild_embeddings --wipe` then `python -m scripts.sync_redis_index`. Check `/health`'s `vector_records` before assuming the index is stale.

**Migrations (`chatbot/migrations/`):** 7 SQL files (`001`–`005` + two dated index/function files), run by hand in the Supabase SQL editor. `003_echo_reviews.sql` is the RLS template: `user_id TEXT` holds the Clerk id, policies check `auth.uid()::text = user_id`.

## Backend (Node data scripts)

The UDC page is a PrimeVue SPA, which is why the main grade scraper is a paste-into-DevTools script. Its download name (`vt_grades_...csv`) differs from what `import_all_grades.js` reads (`vt_grade_distribution_2020-21_to_2025-26.csv`) — rename the file in `data/raw/` first. Grades for 2020-21 → 2025-26 are fully imported; re-scrape only when VT publishes a new academic year (both scrapers hardcode the year range).

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

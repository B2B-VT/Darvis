# Darvis

Live at [darvis.tech](https://darvis.tech). A Virginia Tech academic intelligence platform: grade distributions, professor comparisons, an AI chatbot, a schedule builder, and forums for VT students.

## What it does

- Browse and search VT courses by subject, GPA range, credits, and Pathways concept area
- See historical grade distributions (GPA, A/A- rate, F rate, withdrawals) per course and per professor, sourced from VT UDC
- View RateMyProfessors ratings, difficulty scores, and review excerpts on professor profiles
- Ask Cyrus, the AI chatbot, questions like "which CS 3114 professor has the strongest outcomes?" or "what do I need to graduate with a CS degree?" (currently behind a private early-access allowlist)
- Build a conflict-free weekly schedule from Fall 2026 section data, ranked against VT registrar checksheet roadmaps
- Import a LinkedIn "Save to PDF" export to pre-fill your profile
- Post and discuss on the forums

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite 8, CSS-in-JS, Clerk auth — hosted on Vercel |
| Chatbot | FastAPI (Python), Pandas, Groq (`openai/gpt-oss-120b`) — hosted on Render |
| Retrieval | Redis Cloud (redisvl) — hybrid vector + keyword search with RRF fusion |
| Database | Supabase (Postgres) — also the source of truth for embeddings |
| Data scripts | Node.js 22 scrapers + importers |
| CI | GitHub Actions — Banner timetable scrape every 4 hours |

## Folder layout

```
Darvis/
├── frontend/     React + Vite app (src/App.jsx routing, src/api.js Supabase queries, src/components/ one file per page)
├── chatbot/      FastAPI chatbot: app/ code, tests/ (pytest), scripts/ (embeddings, Redis sync, curriculum + checksheet scrapers), migrations/ (SQL)
├── backend/      Node data pipeline: scrapers/, scripts/ (Supabase importers), supabase/schema.sql (partial schema)
├── evals/        Cyrus JSONL eval harness: run.py, datasets/, graders/, fixtures/
├── .github/      update-timetable.yml + CODEOWNERS
├── CLAUDE.md     Full architecture and conventions reference for coding agents
└── README.md
```

## Running locally

**Frontend**
```bash
cd frontend
npm install
echo "VITE_CLERK_PUBLISHABLE_KEY=pk_test_..." > .env   # required
npm run dev      # http://localhost:5173
```
`VITE_CHAT_API_URL` is optional. Without it the app calls `http://127.0.0.1:8000/chat` on localhost and the Render deployment everywhere else.

**Chatbot**
```bash
cd chatbot
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # fill in GROQ_API_KEY, GROQ_MODEL, SUPABASE_URL, SUPABASE_KEY, REDIS_URL
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```
Set `SHOW_DOCS=true` in `.env` to get the Swagger UI at `/docs`.

**Data scripts**
```bash
cd backend
npm install
cp .env.example .env    # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

## Data pipeline

All scraped inputs land in `backend/data/raw/` (gitignored), then an importer writes them to Supabase.

| Data | Scrape | Import |
|------|--------|--------|
| Grades (all subjects, 2020-21 → 2025-26) | Paste `scrapers/udc_2020_present_scraper.js` into DevTools on the [UDC grades page](https://udc.vt.edu/irdata/data/courses/grades). Rename the downloaded `vt_grades_...csv` to `vt_grade_distribution_2020-21_to_2025-26.csv` | `node scripts/import_all_grades.js` |
| Grades, headless alternative | `npm run scrape-grades` (per-subject CSVs) | `npm run import-grades` |
| Fall sections | `npm run scrape-timetable-auth` (CI runs this every 4 hours) or `npm run scrape-timetable` without login | Authenticated scraper writes directly; otherwise `npm run import-timetable` |
| Course descriptions | `npm run scrape-catalog` | `npm run import-descriptions` |
| Prerequisites | `npm run scrape-prereqs` | `npm run import-prerequisites` |
| Pathways codes | `npm run scrape-pathways` | `npm run import-pathways` |
| RMP ratings → instructors | `node scrapers/rmp_scraper.js` | `node scripts/rebuild_instructors.js` |
| Majors + requirements | `python -m scripts.scrape_curriculum` (from `chatbot/`) | same script |
| Checksheet roadmaps | `python -m scripts.scrape_checksheets` (needs `pdfplumber beautifulsoup4 lxml`) | same script |
| Embeddings | `python -m scripts.rebuild_embeddings --wipe` | `python -m scripts.sync_redis_index` |

The Banner scraper needs a logged-in browser profile. After `npm run auth-banner` (or a headed run of `scrapers/banner_puppeteer_scraper.js`) approves Duo, run `npm run update-banner-secret` so CI can reuse the cookies.

Row counts as of 2026-07-01: 59,790 grade rows across 152 subjects, 6,589 courses, 10,663 Fall 2026 sections, 3,834 instructors (1,982 with RMP ratings), 183 majors with 16,290 requirement rows. The Redis index held 36,210 vectors on 2026-09-29.

## Tests and evals

```bash
cd chatbot && python -m pytest tests/     # 245 tests
```
The frontend has no test runner and no ESLint/Prettier config.

The Cyrus eval harness grades retrieval, routing, formatting and grounding against JSONL suites in `evals/datasets/`. Start the chatbot first, then from the repo root:

```bash
python evals/run.py --end-to-end --all --endpoint http://127.0.0.1:8000/chat   # full suite against a live endpoint
python evals/run.py --dataset course_recommendations.jsonl                   # one dataset
python evals/run.py --id course_rec_ai_001                                   # one case
python evals/run.py --retrieval-only                                         # retrieval/ranking only, no generation
python evals/run.py --generation-only                                        # grade saved fixtures in evals/fixtures/generation/
```
Add `--require-provider-success` to fail the run on rate limits, timeouts, fallbacks or model changes. Results go to `evals/reports/` (gitignored). Target release gates are recorded in `evals/thresholds.yaml`.

Each JSONL case can set `id`, `query`, `user_profile`, `history`, `expected_intent`, `expected_entities`, `must_retrieve`, `acceptable_retrieve`, `must_not_retrieve`, `relevance`, `must_include_in_answer`, `must_not_include_in_answer`, `expected_answer_type`, `expected_format`, `required_table_columns`, `forbidden_behavior` and `notes`. Relevance labels are `3` directly relevant, `2` strongly related, `1` defensible but secondary, `0` irrelevant, `-1` prohibited.

Raw thumbs-up/down feedback never becomes eval or training data automatically. A reviewer first converts it to a record with `query`, `bad_answer`, `failure_labels`, `reviewer_reason`, `corrected_answer`, `expected_courses`, `excluded_courses`, `approved_for_eval` and `approved_for_training`. Only `approved_for_eval: true` cases become JSONL regression cases.

## Pending work

See `CLAUDE.md` for the full list. Top items:

1. Re-authenticate the Banner scraper — the 4-hourly timetable job has failed since at least 2026-08-14, so section data is frozen at 2026-07-01
2. Launch Cyrus publicly by flipping `CYRUS_PUBLIC_LAUNCHED` in `frontend/src/config.js` and clearing the allowlist
3. `courses.avg_gpa` is null for 1,121 courses with no grade rows
4. Swap Vercel's `VITE_CLERK_PUBLISHABLE_KEY` from `pk_test_` to `pk_live_`
5. Wire `chatbot/app/generation/` into `/chat` or remove it
6. Drop the dead `grade_embeddings` and legacy `professors` tables

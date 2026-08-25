# Darvis

Live at [darvis.tech](https://darvis.tech). Virginia Tech academic intelligence platform — grade distributions, professor comparisons, an AI chatbot, a schedule builder, and forums for VT students.

## What it does

- Browse and search VT courses by subject, GPA range, credits, and Pathways concept area
- See historical grade distributions (GPA, A/A- rate, F rate, withdrawals) per course and per professor, sourced from VT UDC
- View RateMyProfessors ratings, difficulty scores, and review excerpts on professor profiles
- Ask "Cyrus", the AI chatbot, questions like "which CS 3114 professor has the strongest outcomes?" or "what do I need to graduate with a CS degree?" — currently gated behind a private early-access allowlist ahead of public launch
- Build a conflict-free weekly schedule from live Fall 2026 section data, ranked against VT registrar checksheet roadmaps
- Import a LinkedIn "Save to PDF" export to pre-fill your profile
- Post and discuss on the forums

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite 8, CSS-in-JS, Clerk auth |
| Chatbot backend | FastAPI (Python), Pandas, Groq (`openai/gpt-oss-120b`) |
| Retrieval | Redis Cloud (redisvl) — hybrid vector + keyword search, RRF fusion |
| Data scripts | Node.js 22 (scrapers + importers) |
| Database | Supabase (Postgres) — also the durable source of truth for embeddings |
| Frontend hosting | Vercel |
| Chatbot hosting | Render |
| Auth | Clerk (waitlist/beta mode) |
| CI | GitHub Actions — authenticated Banner timetable scrape every 4h |

## Folder layout

```
Darvis/
├── .github/workflows/      update-timetable.yml — Banner scrape every 4h
├── CLAUDE.md / AGENTS.md   Full architecture context for coding agents (kept in sync)
├── README.md               This file
├── frontend/               React + Vite frontend — deployed on Vercel
│   ├── index.html          Vite entry point
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx         Root component, page routing (state-based, no router lib), dark mode
│       ├── api.js          Most Supabase queries
│       ├── config.js       Supabase URL + publishable key, chatbot API URL, Cyrus access gate
│       └── components/     One file per page (landing, courses, chatbot, schedule, etc.)
├── chatbot/                FastAPI chatbot — deployed on Render
│   ├── app/                Application code (rag/, features/, data/, safety/, generation/)
│   ├── migrations/         SQL migrations, run by hand against Supabase
│   ├── scripts/            Embedding builders, Redis sync, curriculum + checksheet scrapers
│   ├── tests/              pytest suite
│   ├── requirements.txt
│   └── README.md
├── backend/                Node.js data pipeline (not a server)
│   ├── scrapers/           UDC grades (browser-console + Playwright), Banner timetable, RMP, catalog, prereqs, Pathways
│   ├── scripts/            Supabase importers
│   ├── supabase/schema.sql Full DB schema
│   └── README.md
├── evals/                  "Cyrus" JSONL eval harness — retrieval QA, reranker A/B, LLM-judge grading
├── docs/                   Chatbot audit + implementation-plan trail; design specs and plans
└── tools/                  One-off diagnostics
```

## Running locally

**Frontend:**
```bash
cd frontend
npm install
echo "VITE_CLERK_PUBLISHABLE_KEY=pk_test_..." > .env   # required
npm run dev      # http://localhost:5173
```
`VITE_CHAT_API_URL` is optional — without it the app points at `http://127.0.0.1:8000/chat` on localhost and at the Render deployment everywhere else.

**Chatbot:**
```bash
cd chatbot
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # fill in GROQ_API_KEY, SUPABASE_URL, SUPABASE_KEY, REDIS_URL
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```
`.env.example` defines ~44 vars; the four above plus `GROQ_MODEL` are the ones needed to boot.

**Data scripts:**
```bash
cd backend
npm install
cp .env.example .env    # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run import-grades   # after dropping vt_udc_grades_*.csv in data/raw/
```

## Tests

```bash
cd chatbot && python -m pytest tests/                                   # 16 test files
python evals/run.py --end-to-end --all --endpoint http://127.0.0.1:8000/chat
```
The frontend has no test runner and no ESLint/Prettier config — plain JS, manual formatting.

## Data pipeline status

Row counts verified 2026-07-01 unless noted.

| Data | Status |
|------|--------|
| Grades | 59,790 rows across all 152 subjects (2020-21 → 2025-26) — full UDC import complete. Re-scrape only when VT releases a new academic year |
| Courses | 6,589 — 5,468 with `avg_gpa`, 5,051 with descriptions, 1,153 with prerequisites, 751 with Pathways codes |
| Sections | 10,663 rows for Fall 2026 (term `202609`) — auto-refreshed every 4h by the GitHub Actions Banner scrape |
| Instructors | 3,834 — 1,982 matched to RMP ratings (`rmp_tags` stays empty; RMP's API doesn't return them) |
| Major requirements | 183 majors, 16,290 requirement rows, plus registrar checksheet roadmaps |
| Embeddings | Supabase `embeddings` is the source of truth; the live Redis index held 36,210 vectors as of 2026-07-31. Rebuild with `python -m scripts.rebuild_embeddings --wipe` then `python -m scripts.sync_redis_index` |

## Pending work

See `CLAUDE.md` for the full issue list. Top items:

1. Launch Cyrus publicly — flip `CYRUS_PUBLIC_LAUNCHED` in `frontend/src/config.js` and clear the allowlist
2. `courses.avg_gpa` is still null for 1,121 courses that have no matching grade rows
3. `chatbot/app/generation/` (OpenAI multi-tier structured generation) is built and tested but not wired into `/chat` — wire it in or drop the flag
4. Drop the dead `grade_embeddings` table (0 rows, unreferenced)
5. Upgrade Render to Starter ($7/month) to eliminate ~30s cold-start latency

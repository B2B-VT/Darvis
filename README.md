# Darvis

Live at [darvis.tech](https://darvis.tech). Virginia Tech academic intelligence platform — grade distributions, professor comparisons, AI chatbot, schedule builder, and forums for VT students.

## What it does

- Browse and search VT courses by subject, GPA range, and credits (Pathways filter present in the UI but awaiting Pathways data import)
- See historical grade distributions (GPA, A/A- rate, F rate, withdrawals) per course and per professor, sourced from VT UDC
- View RateMyProfessors ratings and difficulty scores on professor profiles
- Ask the AI chatbot questions like "which CS 3114 professor has the strongest outcomes?" or "what do I need to graduate with a CS degree?"
- Build a conflict-free weekly schedule from live Fall 2026 section data
- Post and discuss on the forums

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite, CSS-in-JS, Clerk auth |
| Chatbot backend | FastAPI (Python), Pandas, Claude Haiku (Anthropic API) |
| Data scripts | Node.js (scrapers + importers) |
| Database | Supabase (Postgres) — embeddings source of truth, synced into Redis (redisvl) for retrieval |
| Frontend hosting | Vercel |
| Chatbot hosting | Render |
| Auth | Clerk (waitlist/beta mode) |

## Folder layout

```
Darvis/
├── .github/workflows/      update-timetable.yml — Banner scrape every 4h
├── CLAUDE.md               Full architecture context for Claude Code sessions
├── README.md               This file
├── frontend/               React + Vite frontend — deployed on Vercel
│   ├── index.html          Vite entry point
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx         Root component, page routing, dark mode
│       ├── api.js          All Supabase queries
│       ├── config.js       Supabase URL + key, chatbot API URL
│       └── components/     One file per page (landing, courses, chatbot, etc.)
├── chatbot/                FastAPI chatbot — deployed on Render
│   ├── app/                Application code
│   ├── requirements.txt
│   └── README.md
└── backend/                Node.js data pipeline (not a server)
    ├── scrapers/           UDC grade scrapers (browser-console + Playwright), Banner timetable scrapers, RMP, catalog, prereq scrapers
    ├── scripts/            Supabase importers
    └── README.md
```

## Running locally

**Frontend:**
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

**Chatbot:**
```bash
cd chatbot
source .venv/bin/activate
cp .env.example .env    # fill in ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY, REDIS_URL
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

## Data pipeline status

Grades: 59,790 rows across all 152 subjects (2020-21 through 2025-26) — full UDC import complete. Re-scrape only when VT releases a new academic year of data.
Sections (Fall 2026 timetable): 10,663 rows in Supabase — auto-refreshed every 4 hours by a GitHub Actions Banner scrape (`.github/workflows/update-timetable.yml`).
RMP ratings: 1,982 of 3,834 instructors matched and imported.
Major requirements: 183 majors, 16,290 requirement rows.

## Pending work

See `CLAUDE.md` for the full issue list. Top items:

1. Finish the embeddings rebuild and Redis re-sync (~30.8k chunks) — `python -m scripts.rebuild_embeddings --wipe` then `python -m scripts.sync_redis_index` in `chatbot/`; the previous vectors were built 2026-05-23 against pre-import data and no longer cover the full grades/courses/instructors tables
2. Wire the frontend thumbs up/down UI to the existing `POST /feedback` endpoint
3. Populate `courses.pathways` from VT Pathways static data
4. Upgrade Render to Starter ($7/month) to eliminate cold-start latency

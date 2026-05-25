# Darvis

Live at [darvis.tech](https://darvis.tech). Virginia Tech academic intelligence platform — grade distributions, professor comparisons, AI chatbot, schedule builder, and forums for VT students.

## What it does

- Browse and search VT courses by subject, GPA range, Pathways, and credits
- See historical grade distributions (GPA, A/A- rate, F rate, withdrawals) per course and per professor, sourced from VT UDC
- View RateMyProfessors ratings and difficulty scores on professor profiles
- Ask the AI chatbot questions like "which CS 3114 professor has the strongest outcomes?" or "what do I need to graduate with a CS degree?"
- Build a conflict-free weekly schedule from live Fall 2026 section data
- Post and discuss on the forums

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 (CDN + Babel), CSS-in-JS, Clerk auth |
| Chatbot backend | FastAPI (Python), Pandas, Google AI Studio (Gemma) |
| Data scripts | Node.js (scrapers + importers) |
| Database | Supabase (Postgres + pgvector) |
| Frontend hosting | Vercel |
| Chatbot hosting | Render |
| Auth | Clerk (waitlist/beta mode) |

## Folder layout

```
Hokie_Darvis/
├── CLAUDE.md               Full architecture context for Claude Code sessions
├── README.md               This file
├── frontend/               React frontend — deployed on Vercel
│   ├── index.html          Entry point
│   └── src/
│       ├── App.jsx         Root component, routing, dark mode
│       ├── api.js          All Supabase queries
│       ├── config.js       Supabase URL + publishable key
│       └── components/     One file per page (landing, courses, chatbot, etc.)
├── chat-bot/               FastAPI chatbot — deployed on Render
│   ├── app/                Application code
│   ├── requirements.txt
│   └── README.md
└── backend/                Node.js data pipeline (not a server)
    ├── scrapers/            Browser-console grade scraper + RMP scraper
    ├── scripts/             Supabase importers
    └── README.md
```

## Running locally

**Frontend:**
```bash
cd frontend
npx serve .      # http://localhost:3000
```

**Chatbot:**
```bash
cd chat-bot
source .venv/bin/activate
cp .env.example .env    # fill in GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_KEY
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

## Data pipeline status

| Subject area | Grades scraped | In Supabase |
|---|---|---|
| CS | Yes | 1,706 rows |
| ECE, MATH, BIOL, all others | No | Pending — waiting on hardware |

Sections (Fall 2026 timetable): 10,129 rows in Supabase.
RMP ratings: 65 instructors matched and imported.
Major requirements: 183 majors, 16,151 requirement rows.

## Pending work

See `CLAUDE.md` for the full issue list. Top items:

1. Scrape and import remaining UDC subjects (ECE, MATH, BIOL, etc.)
2. Fix `natural_filter.py` chart label for `lowest_gpa` sort goal
3. Build feedback collection (thumbs up/down logging)
4. Populate `courses.pathways` from VT Pathways static data
5. Upgrade Render to Starter ($7/month) to eliminate cold start latency

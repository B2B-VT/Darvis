# Darvis — Data pipeline

Node.js scripts for scraping and importing grade data, RMP ratings, course descriptions, and section data into Supabase. This is not a server — these are one-off scripts run manually each semester or when new data is available.

## Scripts

UDC grade scrapers are **browser-console** scripts: the VT UDC grades page is a PrimeVue SPA that can't be driven server-side, so you paste the script into DevTools on the live page. The others are normal Node scripts run from `backend/`.

| Script | What it does | Run from |
|--------|-------------|----------|
| `scrapers/udc_single_scraper.js` | Scrapes every course under the **one** subject you've manually selected, downloads a CSV. | Browser console |
| `scrapers/udc_batch_scraper.js` | Starts from the currently-selected subject and works forward through all remaining subjects, one CSV per subject. | Browser console |
| `scrapers/udc_grades_scraper.js` | One subject per run, tracking completed subjects in `localStorage`. Refresh + re-paste to do the next one. | Browser console |
| `scrapers/udc_2020_present_scraper.js` | Scrapes every subject × course for 2020-21 → 2025-26 into one combined CSV. | Browser console |
| `scrapers/rmp_scraper.js` | Fetches all VT professors from RMP's GraphQL API. Saves to `data/raw/rmp_vt_professors.json`. | `node scrapers/rmp_scraper.js` |
| `scrapers/catalog_scraper.js` | Scrapes course descriptions from catalog.vt.edu (Courseleaf JSON API, Puppeteer fallback). Saves to `data/raw/course_descriptions.json`. | `npm run scrape-catalog` |
| `scripts/import_grades.js` | Reads `vt_udc_grades_*.csv` from `data/raw/`, upserts into the `grades` table, then aggregates each `(subject, course_number)` into `courses`. | `npm run import-grades` |
| `scripts/import_timetable.js` | Reads `vt_timetable_*.csv` from `data/raw/`, upserts rows into the `sections` table. | `npm run import-timetable` |
| `scripts/import_descriptions.js` | Reads `course_descriptions.json`, writes `courses.description` where it is currently null/empty. Safe to re-run. | `npm run import-descriptions` |
| `scripts/import_rmp.js` | Reads `rmp_vt_professors.json`, matches each entry to a grade instructor by last name, upserts into the legacy `professors` table. | `node scripts/import_rmp.js` |
| `scripts/fetch_rmp_tags.js` | Fetches individual RMP profiles to populate `rmp_tags`. **No-op:** RMP's GraphQL API does not return `teacherRatingTags`, so tags come back empty. Accepted limitation. | `node scripts/fetch_rmp_tags.js` |

## Setup

```bash
cd backend
npm install
cp .env.example .env    # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

## Scraping grades (UDC)

The VT UDC grade page uses PrimeVue VirtualScroller for subject selection, which can't be controlled cleanly from outside the page — so the UDC scrapers are browser-console scripts you paste in once the page has loaded. Pick the variant that matches the job:

- **One subject:** `udc_single_scraper.js` (manually select the subject first).
- **A run of subjects:** `udc_batch_scraper.js` (select a starting subject, it works forward).
- **Resumable, one-at-a-time:** `udc_grades_scraper.js` (tracks progress in `localStorage`).
- **Everything at once:** `udc_2020_present_scraper.js` (all subjects × courses, 2020-21 → 2025-26).

Typical flow:

1. Go to https://udc.vt.edu/irdata/data/courses/grades and let it fully load
2. Manually select a subject from the dropdown (e.g., ECE)
3. Open DevTools console (Cmd+Option+J), paste the chosen scraper, hit Enter
4. The script scrapes all pages and downloads a CSV automatically (stop early with `window.__udcStop = true`)
5. Drop the CSV(s) into `data/raw/`
6. Run `npm run import-grades`

CS (1,706 rows) is the only subject currently in Supabase. ECE, MATH, BIOL, and all others are pending — blocked waiting on faster hardware for bulk scraping.

## Database tables (Supabase)

| Table | Rows | Notes |
|-------|------|-------|
| `grades` | 1,706 | CS only currently |
| `courses` | 3,564 | All have `total_sections`; 137 have `avg_gpa` (CS only); `pathways` empty; `description` populated via `import_descriptions.js` |
| `sections` | 10,129 | Fall 2026, term `202609` |
| `instructors` | 210 | 65 with RMP ratings; `rmp_tags` empty for all (RMP API limitation). Read by both the frontend `api.js` and the chatbot. |
| `professors` | 65 | Legacy. Written by `import_rmp.js`, but **not read** by any app code (both frontend and chatbot read `instructors`). Consolidate when convenient. |
| `majors` | 183 | |
| `major_requirements` | 16,151 | |
| `embeddings` | 4,576 | pgvector embeddings; `search_embeddings` RPC exists |
| `grade_embeddings` | 0 | Dead table — unused, can be dropped |

Full schema: `supabase/schema.sql`

## Pending data work

1. **Other subjects** — run a UDC scraper for ECE, MATH, BIOL, and remaining subjects once hardware is available
2. **Pathways** — `courses.pathways` is empty for all 3,564 courses. Needs a static JSON lookup built from VT Pathways catalog data and imported
3. **Descriptions** — run `catalog_scraper.js` + `import_descriptions.js` to backfill `courses.description` for remaining subjects
4. **grade_embeddings** — dead table. Drop it when convenient
5. **Two professor tables** — fold the legacy `professors` table into `instructors` and retire `import_rmp.js`'s write target

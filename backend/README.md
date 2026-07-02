# Darvis — Data pipeline

Node.js scripts for scraping and importing grade data, RMP ratings, course descriptions, and section data into Supabase. This is not a server — most scripts are one-off, run manually when new data is available. Exception: `scrapers/banner_puppeteer_scraper.js` runs automatically every 4 hours via GitHub Actions (`.github/workflows/update-timetable.yml`) to keep the `sections` table fresh.

## Scripts

Most UDC grade scrapers are **browser-console** scripts: the VT UDC grades page is a PrimeVue SPA that can't be driven server-side, so you paste the script into DevTools on the live page (the Playwright variant runs headless instead). The others are normal Node scripts run from `backend/`.

| Script | What it does | Run from |
|--------|-------------|----------|
| `scrapers/udc_single_scraper.js` | Scrapes every course under the **one** subject you've manually selected, downloads a CSV. | Browser console |
| `scrapers/udc_batch_scraper.js` | Starts from the currently-selected subject and works forward through all remaining subjects, one CSV per subject. | Browser console |
| `scrapers/udc_grades_scraper.js` | One subject per run, tracking completed subjects in `localStorage`. Refresh + re-paste to do the next one. | Browser console |
| `scrapers/udc_2020_present_scraper.js` | Scrapes every subject × course for 2020-21 → 2025-26 into one combined CSV. | Browser console |
| `scrapers/udc_playwright_scraper.js` | Headless Playwright UDC grade scrape — no browser console needed. | `npm run scrape-grades` |
| `scrapers/udc_diag.js` | Diagnostic — inspect UDC page structure. | Browser console |
| `scrapers/udc_intercept.js` | Network-intercept variant of the UDC scraper. | Browser console |
| `scrapers/rmp_scraper.js` | Fetches all VT professors from RMP's GraphQL API. Saves to `data/raw/rmp_vt_professors.json`. | `node scrapers/rmp_scraper.js` |
| `scrapers/catalog_scraper.js` | Scrapes course descriptions from catalog.vt.edu (Courseleaf JSON API, Puppeteer fallback). Saves to `data/raw/course_descriptions.json`. | `npm run scrape-catalog` |
| `scrapers/prereq_scraper.js` | Scrapes course prerequisites from catalog.vt.edu → `data/raw/course_prerequisites.json`. | `npm run scrape-prereqs` |
| `scrapers/banner_timetable_scraper.js` | Scrapes the VT Banner timetable. | `npm run scrape-timetable` |
| `scrapers/banner_puppeteer_scraper.js` | Authenticated Puppeteer Banner scrape; upserts directly into `sections`. Runs every 4h in GitHub Actions. | `npm run scrape-timetable-auth` |
| `scrapers/banner_auth_helper.js` | Interactive Banner/CAS login to capture browser-profile cookies for the authenticated scraper. | `npm run auth-banner` |
| `scripts/import_grades.js` | Reads `vt_udc_grades_*.csv` from `data/raw/`, upserts into the `grades` table, then aggregates each `(subject, course_number)` into `courses`. | `npm run import-grades` |
| `scripts/import_all_grades.js` | Bulk variant of import_grades — imports all grade CSVs in one pass. | `node scripts/import_all_grades.js` |
| `scripts/import_timetable.js` | Reads `vt_timetable_*.csv` from `data/raw/`, upserts rows into the `sections` table. | `npm run import-timetable` |
| `scripts/import_descriptions.js` | Reads `course_descriptions.json`, writes `courses.description` where it is currently null/empty. Safe to re-run. | `npm run import-descriptions` |
| `scripts/import_prerequisites.js` | Reads `course_prerequisites.json`, upserts into `courses.prerequisites` (column must exist — see schema note below). | `npm run import-prerequisites` |
| `scripts/import_rmp.js` | Reads `rmp_vt_professors.json`, matches each entry to a grade instructor by last name, upserts into the legacy `professors` table. | `node scripts/import_rmp.js` |
| `scripts/rebuild_instructors.js` | Rebuilds the `instructors` table from all subjects + fresh RMP data. | `node scripts/rebuild_instructors.js` |
| `scripts/fetch_rmp_tags.js` | Fetches individual RMP profiles to populate `rmp_tags`. **No-op:** RMP's GraphQL API does not return `teacherRatingTags`, so tags come back empty. Accepted limitation. | `node scripts/fetch_rmp_tags.js` |
| `scripts/update_banner_secret.sh` | Re-encodes local Banner browser-profile cookies into the `BANNER_PROFILE_B64` GitHub secret. | `npm run update-banner-secret` |

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

All 152 subjects (2020-21 → 2025-26) are imported — 59,790 rows in Supabase. Re-run a scraper + `npm run import-grades` only when a new academic year of UDC data is released.

## Database tables (Supabase)

| Table | Rows | Notes |
|-------|------|-------|
| `grades` | 59,790 | All 152 subjects, 2020-21 → 2025-26 |
| `courses` | 6,589 | 5,468 have `avg_gpa`; `pathways` empty for all; `description` empty for all — catalog scrape/import still needs to run |
| `sections` | 10,663 | Fall 2026, term `202609` — auto-updated every 4h by GitHub Actions (`banner_puppeteer_scraper.js`) |
| `instructors` | 3,834 | 1,982 with RMP ratings; `rmp_tags` empty for all (RMP API limitation). Read by both the frontend `api.js` and the chatbot. |
| `professors` | 65 | Legacy. Written by `import_rmp.js`, but **not read** by any app code (both frontend and chatbot read `instructors`). Consolidate when convenient. |
| `majors` | 183 | |
| `major_requirements` | 16,290 | |
| `embeddings` | ~30.8k (rebuilding) | Source of truth for the Redis (redisvl) retrieval index, synced via `chatbot/scripts/sync_redis_index.py`; legacy `search_embeddings` RPC no longer used. Being rebuilt (`rebuild_embeddings --wipe` + `sync_redis_index`) — the old 4,576 vectors (2026-05-23) predate the full import |
| `grade_embeddings` | 0 | Dead table — unused, can be dropped |
| `feedback` | — | Written by the chatbot `POST /feedback` endpoint |
| `forum_posts` | 1 | Forums page |
| `forum_replies` | 0 | Forums page |

Partial schema (core tables only): `supabase/schema.sql` — `instructors`, `majors`, `major_requirements`, `embeddings`, `feedback`, and the forum tables were created directly in Supabase and are not defined there. It also defines a `courses.prerequisites` column that does **not** exist in the live DB — add it (`ALTER TABLE courses ADD COLUMN prerequisites TEXT;`) before running `npm run import-prerequisites`.

## Pending data work

1. **Embeddings** — rebuild in progress (~30.8k chunks): `python -m scripts.rebuild_embeddings --wipe` then `python -m scripts.sync_redis_index` from `chatbot/`; the old vectors (2026-05-23) predate the full grades/courses/instructors import
2. **Pathways** — `courses.pathways` is empty for all 6,589 courses. Needs a static JSON lookup built from VT Pathways catalog data and imported
3. **Descriptions** — run `catalog_scraper.js` + `import_descriptions.js` to backfill `courses.description` (currently empty for all courses)
4. **grade_embeddings** — dead table. Drop it when convenient
5. **Two professor tables** — fold the legacy `professors` table into `instructors` and retire `import_rmp.js`'s write target

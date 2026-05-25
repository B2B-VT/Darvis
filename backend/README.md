# Darvis — Data pipeline

Node.js scripts for scraping and importing grade data, RMP ratings, and section data into Supabase. This is not a server — these are one-off scripts run manually each semester or when new data is available.

## Scripts

| Script | What it does | Run from |
|--------|-------------|----------|
| `scrapers/udc_cs_manual.js` | Scrapes grade distributions from VT UDC for one subject at a time. Paste into browser console on the UDC grades page. | Browser console |
| `scrapers/rmp_scraper.js` | Scrapes all VT professors from RMP's GraphQL API. Saves to `data/raw/rmp_vt_professors.json`. | `node scrapers/rmp_scraper.js` |
| `scripts/import_grades.js` | Reads CSVs from `data/raw/`, upserts rows into Supabase `grades` table in 500-row chunks. | `node scripts/import_grades.js` |
| `scripts/import_rmp.js` | Reads `data/raw/rmp_vt_professors.json`, matches by last name to grade instructors, upserts into `instructors` table. | `node scripts/import_rmp.js` |
| `scripts/fetch_rmp_tags.js` | Fetches individual RMP profiles to populate `rmp_tags` in the `instructors` table. **Note:** RMP's GraphQL API does not return `teacherRatingTags` — this script runs successfully but tags come back empty. Accepted limitation. | `node scripts/fetch_rmp_tags.js` |

## Setup

```bash
cd backend
npm install
cp .env.example .env    # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

## Scraping grades (UDC)

The VT UDC grade page uses PrimeVue VirtualScroller for subject selection, which cannot be controlled programmatically. The workaround is `udc_cs_manual.js` — a browser-console script that skips all dropdown interaction and scrapes directly once you have manually selected a subject.

1. Go to https://udc.vt.edu/irdata/data/courses/grades
2. Manually select a subject from the dropdown (e.g., ECE)
3. Open DevTools console, paste the contents of `scrapers/udc_cs_manual.js`, hit Enter
4. The script scrapes all pages and downloads a CSV automatically
5. Drop the CSV into `data/raw/`
6. Run `node scripts/import_grades.js`

Repeat for each subject. CS (1,706 rows) is the only subject currently in Supabase. ECE, MATH, BIOL, and all others are pending — blocked waiting on faster hardware for bulk scraping.

## Database tables (Supabase)

| Table | Rows | Notes |
|-------|------|-------|
| `grades` | 1,706 | CS only currently |
| `courses` | 3,564 | All have `total_sections`; 137 have `avg_gpa` (CS only); none have `pathways` or `description` |
| `sections` | 10,129 | Fall 2026, term `202609` |
| `instructors` | 210 | 65 with RMP ratings; `rmp_tags` empty for all (RMP API limitation) |
| `professors` | 65 | Legacy — used by frontend `api.js` only. Chatbot uses `instructors`. |
| `majors` | 183 | |
| `major_requirements` | 16,151 | |
| `embeddings` | 4,576 | pgvector embeddings; `search_embeddings` RPC exists |
| `grade_embeddings` | 0 | Dead table — unused, can be dropped |

Full schema: `supabase/schema.sql`

## Pending data work

1. **Other subjects** — run UDC scraper for ECE, MATH, BIOL, and remaining subjects once hardware is available
2. **Pathways** — `courses.pathways` is empty for all 3,564 courses. Needs a static JSON lookup built from VT Pathways catalog data and imported
3. **Course descriptions** — `courses.description` is null everywhere. Low priority
4. **grade_embeddings** — dead table. Drop it when convenient

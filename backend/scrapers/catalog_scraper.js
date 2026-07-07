// scrapers/catalog_scraper.js
//
// Scrapes course descriptions from catalog.vt.edu for every subject
// that exists in your Supabase courses table.
//
// Strategy:
//   1. Try the Courseleaf JSON search API (fast, no browser needed).
//   2. Fall back to Puppeteer + waitForSelector if the API returns nothing.
//
// Output: backend/data/raw/course_descriptions.json
//
// Run with: npm run scrape-catalog
// Requirements:
//   - npm install
//   - .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

require('dotenv').config();
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const OUT_FILE = path.join(__dirname, '../data/raw/course_descriptions.json');

// ── Tiny HTTPS helper (no extra deps) ────────────────────────────────────────

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// ── Strategy A: Courseleaf JSON search API ───────────────────────────────────
// catalog.vt.edu runs Courseleaf's "fose" search endpoint.
// POST /course-search/api/?page=fose&route=search with a subject filter
// returns JSON with title + description for every matching course.

async function scrapeViaApi(subject) {
  const payload = JSON.stringify({
    other:    { srcdb: '' },
    criteria: [{ field: 'subject', value: subject }],
  });

  const options = {
    hostname: 'catalog.vt.edu',
    path:     '/course-search/api/?page=fose&route=search',
    method:   'POST',
    headers:  {
      'Content-Type':  'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `https://catalog.vt.edu/undergraduate/course-descriptions/${subject.toLowerCase()}/`,
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
    },
  };

  try {
    const { status, body } = await httpsRequest(options, payload);

    if (process.env.DEBUG_CATALOG) {
      console.log(`  [api] status: ${status}`);
      console.log(`  [api] body (first 800 chars): ${body.slice(0, 800)}`);
    }

    if (status !== 200) return null;

    let json;
    try { json = JSON.parse(body); } catch { return null; }

    if (process.env.DEBUG_CATALOG) {
      console.log(`  [api] top-level keys: ${Object.keys(json).join(', ')}`);
    }

    // VT Courseleaf list endpoint returns { results: [{ key, code, title, srcdb }] }
    // — no descriptions in this response. Descriptions require a per-course detail call.
    // We skip the API approach and let Puppeteer handle it via the rendered page instead.
    const results = json.results || json.courses || json.data || [];

    if (process.env.DEBUG_CATALOG && results.length > 0) {
      console.log(`  [api] first result keys: ${Object.keys(results[0]).join(', ')}`);
      console.log(`  [api] first result sample: ${JSON.stringify(results[0]).slice(0, 400)}`);
    }

    // If results have descriptions, use them. Otherwise fall through to Puppeteer.
    const withDesc = results.filter(r => r.descrlong || r.description || r.long_description || r.crse_desc);
    if (!withDesc.length) return null;

    return withDesc
      .map(r => ({
        subject:      (r.subject || subject).toUpperCase(),
        courseNumber: (r.crse_numb || r.crse_number || r.course_number || (r.code || '').split(' ')[1] || '').trim(),
        description:  (r.descrlong || r.crse_desc || r.description || r.long_description || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter(r => r.courseNumber && r.description.length > 10);

  } catch (err) {
    if (process.env.DEBUG_CATALOG) console.log(`  [api] error: ${err.message}`);
    return null;
  }
}

// ── Strategy B: Puppeteer with proper networkidle wait ───────────────────────

async function scrapeViaPuppeteer(page, subject) {
  // Catalog redesign (2026-2027 edition) dropped the undergraduate/graduate
  // split — every subject now lives under one unified path.
  const urls = [
    `https://catalog.vt.edu/course-descriptions/${subject.toLowerCase()}/`,
  ];

  for (const url of urls) {
    try {
      // networkidle0 waits until there are no network connections for 500ms —
      // this lets Courseleaf Lexi finish its API calls before we read the DOM.
      const res = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      if (!res || res.status() === 404) continue;

      // Extra buffer in case React is still rendering after network goes idle
      await new Promise(r => setTimeout(r, 2000));

      // Save debug HTML if requested
      if (process.env.DEBUG_CATALOG) {
        const html = await page.content();
        const debugFile = path.join(__dirname, `../data/raw/debug_${subject.toLowerCase()}_puppeteer.html`);
        fs.mkdirSync(path.dirname(debugFile), { recursive: true });
        fs.writeFileSync(debugFile, html);
        console.log(`  [debug] HTML (${html.length} bytes) saved to ${debugFile}`);

        // Probe what the DOM looks like
        const probe = await page.evaluate(() => ({
          hasBody:       !!document.body,
          bodyLen:       document.body ? document.body.innerText.length : 0,
          courseblocks:  document.querySelectorAll('.courseblock').length,
          h3s:           document.querySelectorAll('h3').length,
          h4s:           document.querySelectorAll('h4').length,
          snippet:       document.body ? document.body.innerText.slice(0, 600) : '(no body)',
        }));
        console.log(`  [probe] body:${probe.hasBody} len:${probe.bodyLen} .courseblock:${probe.courseblocks} h3:${probe.h3s} h4:${probe.h4s}`);
        console.log(`  [probe] snippet:\n${probe.snippet}\n`);
      }

      // Try to wait for course content to appear (up to 10s)
      try {
        await page.waitForFunction(
          () => document.querySelectorAll('.courseblock, [class*="course"]').length > 0
               || document.querySelectorAll('h3, h4').length > 5,
          { timeout: 10000 }
        );
      } catch (_) {
        // Timeout — page may still have content, continue anyway
      }

      const courses = await page.evaluate((subj) => {
        const out = [];
        if (!document.body) return out;

        // Strategy 1: Courseleaf standard .courseblock
        // VT's catalog uses:
        //   <span class="detail-code"><strong>CS 1014</strong></span>
        //   <div class="courseblockextra">description…</div>
        const blocks = document.querySelectorAll('.courseblock');
        if (blocks.length > 0) {
          blocks.forEach(block => {
            // Try VT-specific code selector first, then fall back to generic
            const codeEl  = block.querySelector('.detail-code, .courseblocktitle, p strong, h3, h4');
            const descEl  = block.querySelector('.courseblockdesc, .courseblockextra, p:not(.courseblocktitle):not(.courseblockattr)');
            if (!codeEl || !descEl) return;
            const codeText = (codeEl.innerText || codeEl.textContent || '').trim();
            const descText = (descEl.innerText || descEl.textContent || '').trim();
            // Extract just the numeric course number: "CS 1014" → "1014"
            const m = codeText.match(/[A-Z]{2,6}\s+([\w-]+)/);
            if (!m) return;
            out.push({ courseNumber: m[1], description: descText });
          });
          if (out.length > 0) return out;
        }

        // Strategy 2: h3 or h4 with "SUBJ NNNN" pattern
        for (const tag of ['h3', 'h4', 'h2']) {
          document.querySelectorAll(tag).forEach(el => {
            const text = el.innerText || el.textContent || '';
            const m = text.match(/^([A-Z]{2,6})\s+(\d[\w-]*)\s*[-:]/);
            if (!m) return;
            let sib = el.nextElementSibling;
            while (sib && !['P','DIV','SECTION'].includes(sib.tagName)) sib = sib.nextElementSibling;
            const desc = sib ? (sib.innerText || sib.textContent || '') : '';
            out.push({ courseNumber: m[2], description: desc });
          });
          if (out.length > 0) return out;
        }

        // Strategy 3: id-anchored elements
        document.querySelectorAll(`[id^="${subj.toLowerCase()}-"]`).forEach(el => {
          const m = el.id.match(/-(\d+\w*)$/);
          if (!m) return;
          const sib = el.nextElementSibling;
          out.push({ courseNumber: m[1].toUpperCase(), description: sib ? (sib.innerText || sib.textContent || '') : '' });
        });

        return out;
      }, subject);

      if (courses.length > 0) {
        return courses
          .filter(c => c.courseNumber && c.description && c.description.length > 10)
          .map(c => ({
            subject,
            courseNumber: c.courseNumber.trim(),
            description:  c.description.replace(/\s+/g, ' ').trim(),
          }));
      }

    } catch (err) {
      if (process.env.DEBUG_CATALOG) console.log(`  [puppeteer] ${url}: ${err.message}`);
    }
  }

  return [];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Get all distinct subjects from Supabase (paginated — table has 6,500+
  //    rows, well past Supabase's default 1000-row cap on a single query)
  let subjectRows = [];
  {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await db
        .from('courses')
        .select('subject')
        .order('subject')
        .range(from, from + PAGE - 1);
      if (error) { console.error('Supabase error:', error.message); process.exit(1); }
      if (!data || data.length === 0) break;
      subjectRows = subjectRows.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  const subjects = [...new Set((subjectRows || []).map(r => r.subject))];
  console.log(`Found ${subjects.length} subjects in DB: ${subjects.join(', ')}\n`);

  // 2. First pass: try the JSON API for all subjects (fast, no browser)
  console.log('Pass 1 — trying Courseleaf JSON API…');
  const apiResults = {};
  const needsPuppeteer = [];

  for (const subject of subjects) {
    const rows = await scrapeViaApi(subject);
    if (rows && rows.length > 0) {
      apiResults[subject] = rows;
      console.log(`  ${subject}: ${rows.length} descriptions via API ✓`);
    } else {
      console.log(`  ${subject}: API returned nothing — queuing for browser`);
      needsPuppeteer.push(subject);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // 3. Second pass: Puppeteer for subjects the API missed
  const puppeteerResults = {};
  if (needsPuppeteer.length > 0) {
    console.log(`\nPass 2 — launching browser for ${needsPuppeteer.length} subject(s)…`);
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    for (const subject of needsPuppeteer) {
      const rows = await scrapeViaPuppeteer(page, subject);
      puppeteerResults[subject] = rows;
      console.log(`  ${subject}: ${rows.length} descriptions via browser`);
      await new Promise(r => setTimeout(r, 1000));
    }

    await browser.close();
  }

  // 4. Merge and save
  const allDescriptions = [
    ...Object.values(apiResults).flat(),
    ...Object.values(puppeteerResults).flat(),
  ];

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(allDescriptions, null, 2));

  const withDesc = allDescriptions.filter(d => d.description.length > 10);
  console.log(`\nDone. ${withDesc.length} descriptions across ${subjects.length} subject(s).`);
  console.log(`Saved to: ${OUT_FILE}`);
  console.log('\nNext step: npm run import-descriptions');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

// scrapers/prereq_scraper.js
//
// Scrapes prerequisite text from catalog.vt.edu for every subject
// in the Supabase courses table.
//
// The VT Courseleaf catalog stores prerequisites in .courseblockattr
// elements prefixed with "Pre:" inside each .courseblock.
//
// Output: backend/data/raw/course_prerequisites.json
// Run with: npm run scrape-prereqs

require('dotenv').config();
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const db       = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const OUT_FILE = path.join(__dirname, '../data/raw/course_prerequisites.json');

// ── Extract prereqs from a loaded Puppeteer page ─────────────────────────────

async function extractPrereqs(page, subject) {
  return page.evaluate((subj) => {
    const out = [];
    if (!document.body) return out;

    const blocks = document.querySelectorAll('.courseblock');
    blocks.forEach(block => {
      // Get course code
      const codeEl = block.querySelector('.detail-code, .courseblocktitle, p strong, h3, h4');
      if (!codeEl) return;

      const codeText = (codeEl.innerText || codeEl.textContent || '').trim();
      const codeMatch = codeText.match(/[A-Z]{2,6}\s+([\w-]+)/);
      if (!codeMatch) return;
      const courseNumber = codeMatch[1].trim();

      // Look for prerequisite text in .courseblockattr elements
      // VT catalog uses "Pre:" as the label, sometimes "Prerequisites:"
      let prereqText = '';

      const attrEls = block.querySelectorAll('.courseblockattr, [class*="attr"], p');
      for (const el of attrEls) {
        const text = (el.innerText || el.textContent || '').trim();
        // Match "Pre:", "Prerequisites:", "Prerequisite:" at start of element
        if (/^pre(requisites?)?:/i.test(text)) {
          prereqText = text.replace(/^pre(requisites?)?:\s*/i, '').replace(/\s+/g, ' ').trim();
          break;
        }
        // Also check child label elements (e.g. <span class="label">Pre:</span>)
        const labelEl = el.querySelector('.label, strong, b');
        if (labelEl) {
          const labelText = (labelEl.innerText || labelEl.textContent || '').trim();
          if (/^pre(requisites?)?:?$/i.test(labelText)) {
            const fullText = text.replace(labelText, '').replace(/^\s*:?\s*/, '').replace(/\s+/g, ' ').trim();
            if (fullText) { prereqText = fullText; break; }
          }
        }
      }

      if (prereqText) {
        out.push({ courseNumber, prerequisites: prereqText });
      }
    });

    return out;
  }, subject);
}

// ── Scrape one subject via Puppeteer ──────────────────────────────────────────

async function scrapeSubject(page, subject) {
  const urls = [
    `https://catalog.vt.edu/undergraduate/course-descriptions/${subject.toLowerCase()}/`,
    `https://catalog.vt.edu/graduate/course-descriptions/${subject.toLowerCase()}/`,
  ];

  const combined = [];

  for (const url of urls) {
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      if (!res || res.status() === 404) continue;

      await new Promise(r => setTimeout(r, 1500));
      try {
        await page.waitForFunction(
          () => document.querySelectorAll('.courseblock').length > 0,
          { timeout: 8000 }
        );
      } catch (_) {}

      const rows = await extractPrereqs(page, subject);
      combined.push(...rows);
    } catch (err) {
      if (process.env.DEBUG_PREREQ) console.log(`  [${subject}] ${url}: ${err.message}`);
    }
  }

  // Deduplicate by courseNumber (undergrad wins)
  const seen = new Set();
  return combined.filter(r => {
    if (seen.has(r.courseNumber)) return false;
    seen.add(r.courseNumber);
    return true;
  }).map(r => ({ subject, ...r }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load existing output to support resume on crash
  let existing = [];
  let doneSubjects = new Set();
  if (fs.existsSync(OUT_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      doneSubjects = new Set(existing.map(r => r.subject));
      console.log(`Resuming: ${doneSubjects.size} subjects already scraped (${existing.length} prereqs loaded)`);
    } catch { existing = []; }
  }

  // Get all subjects from DB
  const { data: subjectRows, error } = await db
    .from('courses')
    .select('subject')
    .order('subject');
  if (error) { console.error('Supabase error:', error.message); process.exit(1); }

  const subjects = [...new Set((subjectRows || []).map(r => r.subject))];
  const pending  = subjects.filter(s => !doneSubjects.has(s));
  console.log(`${subjects.length} total subjects, ${pending.length} to scrape\n`);

  if (pending.length === 0) {
    console.log('All subjects already scraped. Delete the output file to re-run from scratch.');
    console.log('Next step: npm run import-prerequisites');
    return;
  }

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

  const results = [...existing];

  for (let i = 0; i < pending.length; i++) {
    const subject = pending[i];
    process.stdout.write(`[${i + 1}/${pending.length}] ${subject} … `);

    const rows = await scrapeSubject(page, subject);
    results.push(...rows);

    console.log(rows.length > 0 ? `${rows.length} prereqs` : 'none');

    // Save after every subject so a crash doesn't lose progress
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));

    await new Promise(r => setTimeout(r, 800));
  }

  await browser.close();

  const withPrereq = results.filter(r => r.prerequisites);
  console.log(`\nDone. ${withPrereq.length} courses with prerequisites across ${subjects.length} subjects.`);
  console.log(`Saved to: ${OUT_FILE}`);
  console.log('\nNext step: npm run import-prerequisites');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

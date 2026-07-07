// scrapers/pathways_scraper.js
//
// Scrapes VT Pathways concept-area codes from catalog.vt.edu for every
// subject in the Supabase courses table.
//
// The catalog stores this in a .detail-pathway span inside each .courseblock,
// e.g. "Pathway Concept Area(s): 5F Quant & Comp Thnk Found., 10 Ethical Reasoning"
//
// Output: backend/data/raw/course_pathways.json
// Run with: npm run scrape-pathways

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
const OUT_FILE = path.join(__dirname, '../data/raw/course_pathways.json');

// ── Extract pathway codes from a loaded Puppeteer page ───────────────────────

async function extractPathways(page) {
  return page.evaluate(() => {
    const out = [];
    if (!document.body) return out;

    const blocks = document.querySelectorAll('.courseblock');
    blocks.forEach(block => {
      const codeEl = block.querySelector('.detail-code, .courseblocktitle, p strong, h3, h4');
      if (!codeEl) return;
      const codeText = (codeEl.innerText || codeEl.textContent || '').trim();
      const codeMatch = codeText.match(/[A-Z]{2,6}\s+([\w-]+)/);
      if (!codeMatch) return;
      const courseNumber = codeMatch[1].trim();

      const pwEl = block.querySelector('.detail-pathway, [class*="pathway"]');
      if (!pwEl) return;
      const text = (pwEl.innerText || pwEl.textContent || '').trim();
      const stripped = text.replace(/^pathway\s*concept\s*area\(s\):\s*/i, '').trim();
      if (!stripped) return;

      // "5F Quant & Comp Thnk Found., 10 Ethical Reasoning" → ["5f", "10"]
      const codes = stripped.split(',')
        .map(seg => {
          const m = seg.trim().match(/^(\d{1,2}[A-Za-z]?)\b/);
          return m ? m[1].toLowerCase() : null;
        })
        .filter(Boolean);

      if (codes.length > 0) out.push({ courseNumber, pathways: [...new Set(codes)] });
    });

    return out;
  });
}

// ── Scrape one subject via Puppeteer ──────────────────────────────────────────

async function scrapeSubject(page, subject) {
  const url = `https://catalog.vt.edu/course-descriptions/${subject.toLowerCase()}/`;
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    if (!res || res.status() === 404) return [];

    await new Promise(r => setTimeout(r, 1500));
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('.courseblock').length > 0,
        { timeout: 8000 }
      );
    } catch (_) {}

    const rows = await extractPathways(page);
    return rows.map(r => ({ subject, ...r }));
  } catch (err) {
    if (process.env.DEBUG_PATHWAYS) console.log(`  [${subject}] ${url}: ${err.message}`);
    return [];
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let existing = [];
  let doneSubjects = new Set();
  if (fs.existsSync(OUT_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      doneSubjects = new Set(existing.map(r => r.subject));
      console.log(`Resuming: ${doneSubjects.size} subjects already scraped (${existing.length} pathway rows loaded)`);
    } catch { existing = []; }
  }

  // Get all subjects from DB (paginated — table has 6,500+ rows, well past
  // Supabase's default 1000-row cap on a single query)
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
  const pending  = subjects.filter(s => !doneSubjects.has(s));
  console.log(`${subjects.length} total subjects, ${pending.length} to scrape\n`);

  if (pending.length === 0) {
    console.log('All subjects already scraped. Delete the output file to re-run from scratch.');
    console.log('Next step: npm run import-pathways');
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

    console.log(rows.length > 0 ? `${rows.length} with pathways` : 'none');

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));

    await new Promise(r => setTimeout(r, 800));
  }

  await browser.close();

  console.log(`\nDone. ${results.length} courses with pathways across ${subjects.length} subjects.`);
  console.log(`Saved to: ${OUT_FILE}`);
  console.log('\nNext step: npm run import-pathways');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

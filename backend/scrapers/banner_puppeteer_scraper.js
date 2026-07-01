#!/usr/bin/env node
/**
 * VT Banner authenticated scraper — Puppeteer edition.
 *
 * Uses a real browser session (Puppeteer) so cookies from Hokie SPA login
 * automatically apply to every POST via page.evaluate(fetch). This gets
 * instructor names AND seat availability (both hidden in the public timetable).
 *
 * First run (requires visual browser for Duo):
 *   cd backend && node scrapers/banner_puppeteer_scraper.js
 *
 * Subsequent runs (headless, once cookies are saved):
 *   HEADLESS=true node scrapers/banner_puppeteer_scraper.js
 *   NO_DELETE=true HEADLESS=true node scrapers/banner_puppeteer_scraper.js
 *
 * GitHub Actions: set BANNER_COOKIES secret to the contents of
 *   backend/data/progress/banner_cookies.json  (written after first login).
 *   Cookies include Duo "remember me" — valid ~30 days.
 */
'use strict';

require('dotenv').config();
const puppeteer        = require('puppeteer');
const cheerio          = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const fs               = require('fs');
const path             = require('path');

// ── Config ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TERM          = '202609';
const BANNER_FORM   = 'https://selfservice.banner.vt.edu/ssb/HZSKVTSC.P_DispRequest';
const BANNER_POST   = 'https://selfservice.banner.vt.edu/ssb/HZSKVTSC.P_ProcRequest';
const BANNER_LOGIN  = 'https://selfservice.banner.vt.edu/ssb/twbkwbis.P_WWWLogin';
const BANNER_MENU   = 'https://selfservice.banner.vt.edu/ssb/twbkwbis.P_GenMenu?name=bmenu.P_MainMnu';
const DRY_RUN       = process.env.DRY_RUN   === 'true';
const NO_DELETE     = process.env.NO_DELETE  === 'true';
const HEADLESS      = process.env.HEADLESS   === 'true';
const FORCE_SUBJ    = process.env.SUBJECT    ? process.env.SUBJECT.toUpperCase() : null;
const DELAY_MS      = parseInt(process.env.DELAY || '250', 10);
const CHUNK         = 500;
const PROGRESS_DIR   = path.join(__dirname, '../data/progress');
const PROGRESS_FILE  = path.join(PROGRESS_DIR, 'banner_timetable_progress.json');
const USER_DATA_DIR  = path.join(__dirname, '../data/browser-profile');

// ── Logging ────────────────────────────────────────────────────────────────────
const ts    = () => new Date().toISOString().slice(11, 19);
const log   = (...a) => console.log(`[BAN ${ts()}]`, ...a);
const warn  = (...a) => console.warn(`[WARN ${ts()}]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Progress ───────────────────────────────────────────────────────────────────
function ensureDirs() { fs.mkdirSync(PROGRESS_DIR, { recursive: true }); }
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { done: [], sections: 0 }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

// ── Browser profile check ──────────────────────────────────────────────────────
function hasProfile() {
  return fs.existsSync(path.join(USER_DATA_DIR, 'Default', 'Cookies')) ||
         fs.existsSync(path.join(USER_DATA_DIR, 'Default', 'Preferences'));
}

// ── POST body ─────────────────────────────────────────────────────────────────
function buildPostBody(subj) {
  const p = {
    TERMYEAR: TERM, CAMPUS: '0', CORE_CODE: 'AR%',
    subj_code: subj, SCHDTYPE: '%', CRSE_NUMBER: '',
    crn: '', open_only: '', disp_comments_in: 'Y',
    sess_code: '%', inst_name: '', BTN_PRESSED: 'FIND class sections',
  };
  return Object.entries(p)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
    .join('&');
}

// ── Subject list from Banner form JS ──────────────────────────────────────────
function parseSubjects(html) {
  const m = html.match(/case\s+"202609"\s*:([\s\S]*?)break;/);
  if (!m) return [];
  const out = [];
  const re = /new\s+Option\s*\(\s*"[^"]*",\s*"([^"]+)"/g;
  let hit;
  while ((hit = re.exec(m[1])) !== null) {
    const v = hit[1].trim();
    if (v && v !== '%' && v !== 'ALL') out.push(v.toUpperCase());
  }
  return [...new Set(out)].sort();
}

// ── Time / days / instructor helpers ──────────────────────────────────────────
function hhmm24(h, m, period) {
  if (/pm/i.test(period) && h !== 12) h += 12;
  if (/am/i.test(period) && h === 12) h  = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function pad5(s) { const [h, m] = s.split(':'); return `${h.padStart(2,'0')}:${m}`; }
function normalizeAmPm(raw) {
  if (!raw || /^(tba|arr)$/i.test(raw.trim())) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m) return hhmm24(+m[1], +m[2], m[3]);
  const m2 = raw.trim().match(/^(\d{1,2}:\d{2})$/);
  if (m2) return pad5(m2[1]);
  return null;
}
function parseDays(raw) {
  if (!raw) return [];
  const s = raw.trim().toUpperCase();
  if (!s || /^(arr|tba)$/.test(s)) return [];
  if (/\s/.test(s)) return s.split(/\s+/).filter(c => /^[MTWRFSU]$/.test(c));
  return s.split('').filter(c => /[MTWRFSU]/.test(c));
}
function parseInstructor(raw) {
  if (!raw || /^(tba|staff|arr|n\/a)$/i.test(raw.trim())) return null;
  return raw.split(/\n/)
    .map(s => s.replace(/\s*\([A-Z]+\)\s*$/, '').trim())
    .filter(Boolean).join('; ') || null;
}
function colIdx(headers, ...aliases) {
  for (const alias of aliases) {
    const i = headers.findIndex(h => h.includes(alias));
    if (i >= 0) return i;
  }
  return -1;
}

// ── Parse Banner results HTML ──────────────────────────────────────────────────
// Auth view adds a "Seats" (remaining) column before "Capacity".
function parseSections(html, subject) {
  const $ = cheerio.load(html);
  const bodyText = $('body').text().replace(/\s+/g, ' ');

  if (/no open section|no class(es)? found|0 section.*found/i.test(bodyText)) return [];

  // Detect session expiry redirect
  if (/P_WWWLogin|twbkwbis|Please Login/i.test(bodyText.slice(0, 3000))) {
    warn('Session expired — re-run without HEADLESS=true to re-authenticate');
    process.exit(1);
  }

  const $table = $('table.dataentrytable').first();
  if (!$table.length) return [];

  const allRows = $table.find('tr').toArray();
  const headerRowIdx = allRows.findIndex(tr => $(tr).find('td.delabel').length > 0);
  if (headerRowIdx < 0) return [];

  const headers = [];
  $(allRows[headerRowIdx]).find('td').each((_, td) =>
    headers.push($(td).text().replace(/\s+/g, ' ').trim().toLowerCase())
  );

  const IDX = {
    crn:        colIdx(headers, 'crn'),
    course:     colIdx(headers, 'course'),
    cred:       colIdx(headers, 'cr hr', 'cred', 'credit'),
    seats_avail:colIdx(headers, 'seats'),
    cap:        colIdx(headers, 'capacity', 'cap'),
    inst:       colIdx(headers, 'instructor'),
    days:       colIdx(headers, 'days'),
    begin:      colIdx(headers, 'begin'),
    end:        colIdx(headers, 'end'),
    loc:        colIdx(headers, 'location'),
  };
  const isAuth = IDX.seats_avail >= 0;
  log(`  cols=${headers.length} auth=${isAuth} inst_col=${IDX.inst} seats_col=${IDX.seats_avail}`);

  const sections = [];
  const seenCRN  = new Set();

  for (const tr of allRows.slice(headerRowIdx + 1)) {
    const $tr = $(tr);
    if (parseInt($tr.find('td').first().attr('colspan') || '1', 10) > 1) continue;

    const cells = [];
    $tr.find('td').each((_, td) =>
      cells.push($(td).text().replace(/[\s ]+/g, ' ').trim())
    );
    if (!cells.length || cells.every(c => !c)) continue;

    const get = idx => (idx >= 0 && idx < cells.length) ? cells[idx] : '';

    const rawCRN = get(IDX.crn).replace(/\D/g, '');
    if (!rawCRN || seenCRN.has(rawCRN)) continue;
    seenCRN.add(rawCRN);

    const rawCourse = get(IDX.course).trim();
    const di        = rawCourse.lastIndexOf('-');
    const subjCode  = di > 0 ? rawCourse.slice(0, di).toUpperCase() : subject.toUpperCase();
    const courseNum = di > 0 ? rawCourse.slice(di + 1).trim() : rawCourse;
    if (!courseNum) continue;

    const cap        = parseInt(get(IDX.cap), 10);
    const seatsAvail = parseInt(get(IDX.seats_avail), 10);
    const rawCred    = parseFloat(get(IDX.cred));
    const enrolled   = (isAuth && !isNaN(seatsAvail) && !isNaN(cap))
      ? Math.max(0, cap - seatsAvail)
      : 0;

    sections.push({
      crn:           rawCRN,
      subject:       subjCode,
      course_number: courseNum,
      term:          TERM,
      instructor:    parseInstructor(get(IDX.inst)),
      days:          parseDays(get(IDX.days)),
      start_time:    normalizeAmPm(get(IDX.begin)),
      end_time:      normalizeAmPm(get(IDX.end)),
      location:      get(IDX.loc) || null,
      seats:         isNaN(cap) ? 0 : cap,
      enrolled,
      credits:       isNaN(rawCred) ? null : rawCred,
      last_updated:  new Date().toISOString(),
    });
  }
  return sections;
}

// ── Supabase upsert ────────────────────────────────────────────────────────────
async function upsertChunked(supabase, records) {
  let count = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('sections')
      .upsert(records.slice(i, i + CHUNK), { onConflict: 'crn,term', ignoreDuplicates: false })
      .select('id');
    if (error) warn(`Upsert error: ${error.message}`);
    else count += data?.length ?? 0;
  }
  return count;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
    process.exit(1);
  }

  ensureDirs();
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const progress = loadProgress();

  log(`Banner Puppeteer scraper -- term ${TERM}`);
  log(`HEADLESS=${HEADLESS}  DRY_RUN=${DRY_RUN}  NO_DELETE=${NO_DELETE}${FORCE_SUBJ ? `  SUBJECT=${FORCE_SUBJ}` : ''}`);

  // Step 1: Launch browser with persistent profile
  // userDataDir keeps all cookies (including Duo "remember me") across runs.
  // First run: headed so user can log in + approve Duo.
  // Subsequent runs: headless reuses the saved profile — no Duo needed (~30 days).
  const profileExists = hasProfile();
  const runHeadless   = HEADLESS && profileExists;

  if (HEADLESS && !profileExists) {
    console.error('No saved browser profile. Run once without HEADLESS=true to authenticate.');
    process.exit(1);
  }

  log(`Browser profile: ${profileExists ? 'exists' : 'new'} (${USER_DATA_DIR})`);
  const browser = await puppeteer.launch({
    headless: runHeadless,
    userDataDir: USER_DATA_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1200,800'],
    defaultViewport: null,
  });
  const page = await browser.newPage();

  // Step 2: Check session / do login.
  // Use P_GenMenu (requires auth) — navigating to P_WWWLogin forces a new CAS
  // flow even when a valid session already exists in the profile.
  await page.goto(BANNER_MENU, { waitUntil: 'networkidle2', timeout: 30000 });
  const menuUrl    = page.url();
  log(`Auth check URL: ${menuUrl}`);
  const needsLogin = menuUrl.includes('login.vt.edu') || menuUrl.includes('cas.');

  if (needsLogin) {
    if (runHeadless) {
      console.error('Session expired. Run without HEADLESS=true to re-authenticate.');
      await browser.close();
      process.exit(1);
    }
    log('Log in to Hokie SPA and approve Duo in the browser window...');
    // Wait until we're on Banner proper — past CAS, Duo, AND the SAMLart exchange
    await page.waitForFunction(
      () => {
        const h = window.location.href;
        return h.includes('selfservice.banner.vt.edu') &&
               !h.includes('P_WWWLogin') &&
               !h.includes('SAMLart') &&
               !h.includes('login.vt.edu');
      },
      { timeout: 3 * 60 * 1000, polling: 1000 }
    );
    log('Login complete. Profile saved.');
  } else {
    log('Session active.');
  }

  // Log post-auth URL + cookies for debugging
  const postAuthUrl = page.url();
  const postAuthCookies = await page.cookies();
  log(`Post-auth URL: ${postAuthUrl}`);
  log(`Post-auth cookies: ${postAuthCookies.map(c => c.name).join(', ')}`);

  // Navigate to timetable form — stay in same Banner context
  await page.goto(BANNER_FORM, { waitUntil: 'networkidle2', timeout: 30000 });

  // Step 3: Subject list
  const formHtml = await page.content();
  let subjects   = parseSubjects(formHtml);
  if (!subjects.length) {
    warn('Subject parse failed — using CS fallback for this run');
    subjects = ['CS'];
  }
  log(`${subjects.length} subjects`);
  if (FORCE_SUBJ) subjects = [FORCE_SUBJ];

  // Step 4: Delete stale rows on fresh run
  const toScrape  = subjects.filter(s => !progress.done.includes(s));
  const isFreshRun = progress.done.length === 0 && !FORCE_SUBJ;
  log(`${toScrape.length} to scrape (${progress.done.length} already done)`);

  if (!DRY_RUN && !NO_DELETE && isFreshRun) {
    log(`Deleting existing rows for term ${TERM}...`);
    const { error } = await supabase.from('sections').delete().eq('term', TERM);
    if (error) warn(`Delete failed: ${error.message}`);
    else log('Rows cleared.');
  }

  // Step 5: Scrape — navigate to form, fill fields, submit via browser
  // Real browser form submit carries all session cookies + correct headers.
  let totalSections = 0;

  for (let si = 0; si < toScrape.length; si++) {
    const subj = toScrape[si];
    log(`\n[${si + 1}/${toScrape.length}] ${subj}`);

    let html;
    try {
      // POST via fetch inside the authenticated browser session.
      // credentials:'include' sends the authenticated JSESSIONID automatically.
      html = await page.evaluate(async (url, body, referer) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': referer,
          },
          body,
          credentials: 'include',
        });
        return res.text();
      }, BANNER_POST, buildPostBody(subj), BANNER_FORM);
    } catch (err) {
      warn(`  navigation error: ${err.message}`);
      await sleep(DELAY_MS * 4);
      continue;
    }

    if (!html) { warn(`  empty response`); continue; }

    const sections = parseSections(html, subj);
    log(`  ${sections.length} sections`);

    if (sections.length) {
      if (DRY_RUN) {
        const s = sections[0];
        log(`  [DRY] CRN=${s.crn} ${s.subject} ${s.course_number} inst=${s.instructor} seats=${s.seats} enrolled=${s.enrolled}`);
        totalSections += sections.length;
      } else {
        const n = await upsertChunked(supabase, sections);
        log(`  -> ${n} upserted`);
        totalSections += n;
      }
    }

    progress.done.push(subj);
    progress.sections = (progress.sections || 0) + sections.length;
    saveProgress(progress);
    await sleep(DELAY_MS);
  }

  // Step 6: Final count
  log(`\n${'--'.repeat(25)}`);
  log(`Complete -- ${totalSections} sections processed`);
  if (!DRY_RUN) {
    const { count } = await supabase
      .from('sections')
      .select('*', { count: 'exact', head: true })
      .eq('term', TERM);
    log(`Sections in DB for term ${TERM}: ${count}`);
  }

  await browser.close();
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

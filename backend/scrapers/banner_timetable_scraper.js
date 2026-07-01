#!/usr/bin/env node
'use strict';

require('dotenv').config();
const https    = require('https');
const { URL }  = require('url');
const { createClient } = require('@supabase/supabase-js');
const cheerio  = require('cheerio');
const fs       = require('fs');
const path     = require('path');

// ── Config ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TERM          = '202609';
const BANNER_FORM   = 'https://selfservice.banner.vt.edu/ssb/HZSKVTSC.P_DispRequest';
const BANNER_POST   = 'https://selfservice.banner.vt.edu/ssb/HZSKVTSC.P_ProcRequest';
const DRY_RUN       = process.env.DRY_RUN  === 'true';
const NO_DELETE     = process.env.NO_DELETE === 'true';
const PROBE         = process.env.PROBE     === 'true';
const FORCE_SUBJ    = process.env.SUBJECT   ? process.env.SUBJECT.toUpperCase() : null;
const DELAY_MS      = parseInt(process.env.DELAY || '350', 10);
const RETRY_DELAY   = 2500;
const CHUNK         = 500;
const PROGRESS_DIR  = path.join(__dirname, '../data/progress');
const PROGRESS_FILE = path.join(PROGRESS_DIR, 'banner_timetable_progress.json');

// ── Logging ────────────────────────────────────────────────────────────────────
const ts   = () => new Date().toISOString().slice(11, 19);
const log  = (...a) => console.log(`[BAN ${ts()}]`, ...a);
const warn = (...a) => console.warn(`[WARN ${ts()}]`, ...a);

// ── Progress ───────────────────────────────────────────────────────────────────
function ensureDirs() { fs.mkdirSync(PROGRESS_DIR, { recursive: true }); }
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { done: [], sections: 0 }; }
}
function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ── HTTP ───────────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpRequest(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const { method = 'GET', headers = {}, body } = opts;
    const u = new URL(urlStr);
    const reqOpts = {
      hostname: u.hostname,
      port:     u.port || 443,
      path:     u.pathname + u.search,
      method,
      headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Connection':      'keep-alive',
        ...headers,
      },
    };
    if (body) {
      reqOpts.headers['Content-Type']   = 'application/x-www-form-urlencoded';
      reqOpts.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(reqOpts, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const dest = new URL(res.headers.location, urlStr).href;
        return resolve(httpRequest(dest, { method: res.statusCode === 303 ? 'GET' : method, headers }));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('latin1') }));
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('HTTP timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function encodeParams(p) {
  return Object.entries(p)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
    .join('&');
}

async function fetchWithRetry(urlStr, opts, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await httpRequest(urlStr, opts);
      if (res.status === 200) return res.body;
      warn(`HTTP ${res.status} (attempt ${i + 1}/${retries})`);
    } catch (err) {
      warn(`Request error (attempt ${i + 1}/${retries}): ${err.message}`);
    }
    if (i < retries - 1) await sleep(RETRY_DELAY);
  }
  return null;
}

// POST params — field names confirmed from live Banner form HTML
function buildPostParams(subj) {
  return encodeParams({
    TERMYEAR:         TERM,
    CAMPUS:           '0',
    CORE_CODE:        'AR%',
    subj_code:        subj,
    SCHDTYPE:         '%',
    CRSE_NUMBER:      '',
    crn:              '',
    open_only:        '',
    disp_comments_in: 'Y',
    sess_code:        '%',
    inst_name:        '',
    BTN_PRESSED:      'FIND class sections',
  });
}

// ── Parse subject list from Banner form page ───────────────────────────────────
// Subjects are populated via inline JS switch/case, not a static <select>.
function parseSubjects(html) {
  const caseMatch = html.match(/case\s+"202609"\s*:([\s\S]*?)break;/);
  if (!caseMatch) return [];
  const block = caseMatch[1];
  const out   = [];
  const optRe = /new\s+Option\s*\(\s*"[^"]*",\s*"([^"]+)"/g;
  let m;
  while ((m = optRe.exec(block)) !== null) {
    const v = m[1].trim();
    if (v && v !== '%' && v !== 'ALL') out.push(v.toUpperCase());
  }
  return [...new Set(out)].sort();
}

// ── Time helpers ───────────────────────────────────────────────────────────────
function hhmm24(h, m, period) {
  if (/pm/i.test(period) && h !== 12) h += 12;
  if (/am/i.test(period) && h === 12) h  = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function pad5(s) {
  const [h, m] = s.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

// "3:30PM" / "11:00AM" / "TBA" → "15:30" / "11:00" / null
// Banner Begin/End columns are separate (no combined range string).
function normalizeAmPm(raw) {
  if (!raw || /^(tba|arr)$/i.test(raw.trim())) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m) return hhmm24(+m[1], +m[2], m[3]);
  // Bare HH:MM (no AM/PM) — treat as 24h
  const m2 = raw.trim().match(/^(\d{1,2}:\d{2})$/);
  if (m2) return pad5(m2[1]);
  return null;
}

// Legacy range parser — kept for any caller that still uses it
function parseTimeRange(raw) {
  if (!raw) return { start: null, end: null };
  const s = raw.trim();
  if (!s || /^(tba|arr|to be announced|0{4,})$/i.test(s)) return { start: null, end: null };
  const m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (m) return { start: hhmm24(+m[1], +m[2], m[3]), end: hhmm24(+m[4], +m[5], m[6]) };
  const m2 = s.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (m2) return { start: pad5(m2[1]), end: pad5(m2[2]) };
  return { start: null, end: null };
}

// ── Days: "M W F" / "MWF" / "T R" → ["M","W","F"] ───────────────────────────
function parseDays(raw) {
  if (!raw) return [];
  const s = raw.trim().toUpperCase();
  if (!s || /^(arr|tba)$/.test(s)) return [];
  if (/\s/.test(s)) return s.split(/\s+/).filter(c => /^[MTWRFSU]$/.test(c));
  return s.split('').filter(c => /[MTWRFSU]/.test(c));
}

// ── Instructor: "Smith, John (P)" → "Smith, John" ────────────────────────────
function parseInstructor(raw) {
  if (!raw || /^(tba|staff|arr|n\/a)$/i.test(raw.trim())) return null;
  const cleaned = raw
    .split(/\n/)
    .map(s => s.replace(/\s*\([A-Z]+\)\s*$/, '').trim())
    .filter(Boolean)
    .join('; ');
  return cleaned || null;
}

// ── Column index lookup ────────────────────────────────────────────────────────
function colIdx(headers, ...aliases) {
  for (const alias of aliases) {
    const idx = headers.findIndex(h => h.includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

// ── Parse sections from Banner P_ProcRequest results HTML ──────────────────────
//
// Confirmed structure (live VT Banner, July 2026):
//   Table class: "dataentrytable"
//   Header row:  <td class="delabel"> (NOT <th>)
//   Columns:     CRN | Course | Title | Schedule Type | Modality | Cr Hrs |
//                Capacity | Instructor | Days | Begin | End | Location | Exam
//   Course cell: "CS-1014" → split on last "-" for subject + course_number
//   CRN cell:    <a href=...><b>83496</b></a>
//   Comment rows: first <td> has colspan > 1 — skip
//   Enrollment:  not shown publicly (requires Hokie SPA) — enrolled=0
//
function parseSections(html, subject) {
  const $ = cheerio.load(html);

  const bodyText = $('body').text().replace(/\s+/g, ' ');
  if (/no open section|no class(es)? found|0 section.*found/i.test(bodyText)) return [];

  const $table = $('table.dataentrytable').first();
  if (!$table.length) {
    const snippet = $.html().slice(0, 400).replace(/\s+/g, ' ');
    warn(`${subject}: dataentrytable not found. Page snippet: ${snippet}`);
    return [];
  }

  const allRows = $table.find('tr').toArray();

  // Header row: first row containing any td.delabel
  const headerRowIdx = allRows.findIndex(tr => $(tr).find('td.delabel').length > 0);
  if (headerRowIdx < 0) {
    warn(`${subject}: no delabel header row found`);
    return [];
  }

  const headers = [];
  $(allRows[headerRowIdx]).find('td').each((_, td) => {
    headers.push($(td).text().replace(/\s+/g, ' ').trim().toLowerCase());
  });
  log(`  Headers[${headers.length}]: ${headers.join(' | ')}`);

  const IDX = {
    crn:   colIdx(headers, 'crn'),
    course: colIdx(headers, 'course'),
    cred:  colIdx(headers, 'cr hr', 'cred', 'credit'),
    cap:   colIdx(headers, 'capacity', 'cap'),
    inst:  colIdx(headers, 'instructor'),
    days:  colIdx(headers, 'days'),
    begin: colIdx(headers, 'begin'),
    end:   colIdx(headers, 'end'),
    loc:   colIdx(headers, 'location'),
  };
  log(`  IDX crn=${IDX.crn} course=${IDX.course} cred=${IDX.cred} cap=${IDX.cap} inst=${IDX.inst} days=${IDX.days} begin=${IDX.begin} end=${IDX.end} loc=${IDX.loc}`);

  const sections = [];
  const seenCRN  = new Set();

  for (const tr of allRows.slice(headerRowIdx + 1)) {
    const $tr = $(tr);

    // Skip comment rows (first td spans multiple columns)
    const firstTd = $tr.find('td').first();
    const cs = parseInt(firstTd.attr('colspan') || '1', 10);
    if (cs > 1) continue;

    const cells = [];
    $tr.find('td').each((_, td) => {
      cells.push($(td).text().replace(/[\s ]+/g, ' ').trim());
    });
    if (!cells.length || cells.every(c => !c)) continue;

    const get = idx => (idx >= 0 && idx < cells.length) ? cells[idx] : '';

    // CRN is inside <a><b>83496</b></a>
    const rawCRN = get(IDX.crn).replace(/\D/g, '');
    if (!rawCRN) continue;
    if (seenCRN.has(rawCRN)) continue;
    seenCRN.add(rawCRN);

    // "CS-1014" → subject="CS", course_number="1014"
    const rawCourse = get(IDX.course).trim();
    const dashIdx   = rawCourse.lastIndexOf('-');
    const subjCode  = dashIdx > 0 ? rawCourse.slice(0, dashIdx).toUpperCase() : subject.toUpperCase();
    const courseNum = dashIdx > 0 ? rawCourse.slice(dashIdx + 1).trim() : rawCourse;
    if (!courseNum) continue;

    const cap     = parseInt(get(IDX.cap), 10);
    const rawCred = parseFloat(get(IDX.cred));
    const start   = normalizeAmPm(get(IDX.begin));
    const end     = normalizeAmPm(get(IDX.end));

    sections.push({
      crn:           rawCRN,
      subject:       subjCode,
      course_number: courseNum,
      term:          TERM,
      instructor:    parseInstructor(get(IDX.inst)),
      days:          parseDays(get(IDX.days)),
      start_time:    start,
      end_time:      end,
      location:      get(IDX.loc) || null,
      seats:         isNaN(cap) ? 0 : cap,
      enrolled:      0,
      credits:       isNaN(rawCred) ? null : rawCred,
      last_updated:  new Date().toISOString(),
    });
  }

  return sections;
}

// ── Supabase upsert (chunked) ─────────────────────────────────────────────────
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

// ── Comprehensive VT subject fallback (used if form parse fails) ───────────────
const VT_SUBJECTS_FALLBACK = [
  'ACIS','AFST','AHRM','AINS','ALS','AOE','APSC','ARCH','ART','AS','AUDS',
  'BCHM','BIOL','BIT','BMES','BSE',
  'CEE','CHEM','CLA','CNST','COMM','COS','CS',
  'DASC',
  'ECE','ECON','EDCI','EDCO','EDEL','EDEP','EDHE','EDIT','EDLP','EDRE','EDTE',
  'ENGE','ENGL','ENGR','ENT','ENSC','ESM',
  'FAB','FIN','FISH','FIW','FMD','FOR','FREC',
  'GBCB','GEOG','GEOS','GIA',
  'HD','HIST','HORT','HTM',
  'IDST','IDS','INTL','IS','ISE',
  'JMC',
  'LAR','LAHS','LDRS',
  'MACR','MATH','ME','MGT','MINE','MKTG','MLSP','MSE','MUS',
  'NANO','NEUR','NR','NS',
  'PAPA','PHIL','PHYS','PORT','PPWS','PSCI','PSYC',
  'REAL','RED','RLCL','RTM','RUSN',
  'SBIO','SOC','SPAN','STAT','STL','STS','SYSB',
  'TA','TBMB',
  'UAP','UH',
  'VM',
];

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
    console.error('Copy SUPABASE_URL and SUPABASE_KEY from chatbot/.env into backend/.env');
    console.error('(rename SUPABASE_KEY -> SUPABASE_SERVICE_ROLE_KEY or keep as SUPABASE_KEY -- both are accepted)');
    process.exit(1);
  }

  ensureDirs();
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const progress = loadProgress();

  log(`Banner timetable scraper -- term ${TERM}`);
  log(`DRY_RUN=${DRY_RUN}  NO_DELETE=${NO_DELETE}  PROBE=${PROBE}${FORCE_SUBJ ? `  SUBJECT=${FORCE_SUBJ}` : ''}`);

  // Step 1: Get subject list
  log('Fetching Banner form page to enumerate subjects...');
  const formHtml = await fetchWithRetry(BANNER_FORM, {});

  let subjects;
  if (formHtml) {
    subjects = parseSubjects(formHtml);
    if (subjects.length) {
      log(`Parsed ${subjects.length} subjects from form select.`);
    } else {
      warn('Could not parse subjects from form -- using VT fallback list.');
      subjects = [...VT_SUBJECTS_FALLBACK];
    }
  } else {
    warn('Form page fetch failed -- using VT fallback list.');
    subjects = [...VT_SUBJECTS_FALLBACK];
  }

  if (FORCE_SUBJ) subjects = [FORCE_SUBJ];

  // Step 2: PROBE mode
  if (PROBE) {
    const probeSubj = FORCE_SUBJ || subjects[0] || 'CS';
    log(`[PROBE] Fetching ${probeSubj}...`);
    const html = await fetchWithRetry(BANNER_POST, { method: 'POST', body: buildPostParams(probeSubj) });
    if (!html) { console.error('[PROBE] Fetch failed.'); process.exit(1); }

    const probeFile = path.join(PROGRESS_DIR, `banner_probe_${probeSubj}.html`);
    fs.writeFileSync(probeFile, html);
    log(`[PROBE] Raw HTML saved -> ${probeFile}`);

    const sections = parseSections(html, probeSubj);
    log(`[PROBE] ${sections.length} sections parsed`);
    sections.slice(0, 5).forEach(s => {
      log(`  CRN=${s.crn} ${s.subject} ${s.course_number} days=${JSON.stringify(s.days)} ${s.start_time}-${s.end_time} cap=${s.seats} inst=${s.instructor}`);
    });
    log('[PROBE] Inspect HTML file if parsing looks wrong, then run without PROBE=true.');
    return;
  }

  // Step 3: Filter to un-done subjects
  const toScrape = subjects.filter(s => !progress.done.includes(s));
  log(`Subjects: ${subjects.length} total, ${toScrape.length} to scrape, ${progress.done.length} already done`);

  // Step 4: Delete stale rows on fresh run
  const isFreshRun = progress.done.length === 0 && !FORCE_SUBJ;
  if (!DRY_RUN && !NO_DELETE && isFreshRun) {
    log(`Deleting existing rows for term ${TERM}...`);
    const { error } = await supabase.from('sections').delete().eq('term', TERM);
    if (error) {
      warn(`Delete failed: ${error.message} -- continuing with upsert-only`);
    } else {
      log('Existing rows cleared.');
    }
  }

  // Step 5: Scrape each subject
  let totalSections = 0;

  for (let si = 0; si < toScrape.length; si++) {
    const subj = toScrape[si];
    log(`\n[${si + 1}/${toScrape.length}] ${subj}`);

    const html = await fetchWithRetry(BANNER_POST, {
      method: 'POST',
      body:   buildPostParams(subj),
    });

    if (!html) {
      warn(`  Failed to fetch ${subj} after retries -- skipping`);
      await sleep(DELAY_MS);
      continue;
    }

    const sections = parseSections(html, subj);
    log(`  ${sections.length} sections`);

    if (sections.length) {
      if (DRY_RUN) {
        const s = sections[0];
        log(`  [DRY_RUN] Would upsert ${sections.length} -- sample: CRN=${s.crn} ${s.subject} ${s.course_number} days=${JSON.stringify(s.days)} ${s.start_time}`);
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

  // Step 6: Final DB count
  log(`\n${'--'.repeat(25)}`);
  log(`Scrape complete -- ${totalSections} sections processed`);

  if (!DRY_RUN) {
    const { count } = await supabase
      .from('sections')
      .select('*', { count: 'exact', head: true })
      .eq('term', TERM);
    log(`Sections in DB for term ${TERM}: ${count}`);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

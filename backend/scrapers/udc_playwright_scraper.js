#!/usr/bin/env node
/**
 * VT UDC Grade Distribution — Headless Puppeteer scraper
 *
 * Scrapes all subjects × courses for academic years 2020-21 → 2025-26.
 * Uses scroll-based virtualscroller navigation (filter input not reliable).
 *
 * Usage:
 *   node scrapers/udc_playwright_scraper.js
 *
 * Options (env vars):
 *   HEADLESS=false   show the browser (default: true)
 *   SUBJECT=CS       scrape one subject prefix only
 *
 * Output:
 *   data/raw/vt_udc_grades_<SUBJECT>_<timestamp>.csv
 *   data/progress/udc_grades_progress.json
 */

"use strict";

const puppeteer = require("puppeteer");
const fs        = require("fs");
const path      = require("path");

// ── Config ────────────────────────────────────────────────────────────────────

const UDC_URL     = "https://udc.vt.edu/irdata/data/courses/grades";
const YEAR_START  = "2020-21";
const YEAR_END    = "2025-26";
const HEADLESS    = process.env.HEADLESS !== "false";
const FORCE_SUBJ  = process.env.SUBJECT || null;

const OUT_DIR       = path.join(__dirname, "../data/raw");
const PROGRESS_DIR  = path.join(__dirname, "../data/progress");
const PROGRESS_FILE = path.join(PROGRESS_DIR, "udc_grades_progress.json");

const HEADERS = [
  "Academic Year", "Term", "Subject", "Course No.", "Course Title",
  "Instructor", "GPA",
  "A (%)", "A− (%)", "B+ (%)", "B (%)", "B− (%)",
  "C+ (%)", "C (%)", "C− (%)",
  "D+ (%)", "D (%)", "D− (%)",
  "F (%)", "Withdraws", "Graded Enrollment", "CRN", "Credits",
];

// ── Utilities ─────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts    = () => new Date().toISOString().slice(11, 19);
const log   = (...a) => console.log(`[UDC ${ts()}]`, ...a);
const warn  = (...a) => console.warn(`[WARN ${ts()}]`, ...a);

function ensureDirs() {
  [OUT_DIR, PROGRESS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); }
  catch { return { done: [] }; }
}

function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }
function markDone(progress, subject) {
  if (!progress.done.includes(subject)) progress.done.push(subject);
  saveProgress(progress);
}

function safeCode(s) { return s.split(" - ")[0].replace(/[^A-Za-z0-9_-]/g, "").toUpperCase(); }

function toCSV(rows) {
  const esc = v => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [HEADERS.map(esc).join(","), ...rows.map(r => HEADERS.map(h => esc(r[h] ?? "")).join(","))].join("\n");
}

function writeCSV(rows, subject) {
  if (!rows.length) { warn(`No rows for ${subject}`); return; }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const file  = path.join(OUT_DIR, `vt_udc_grades_${safeCode(subject)}_${stamp}.csv`);
  fs.writeFileSync(file, toCSV(rows));
  log(`Saved ${rows.length} rows → ${path.basename(file)}`);
}

// ── Option classifiers ────────────────────────────────────────────────────────

const isYear    = s => /^20\d{2}-\d{2}$/.test(s.trim());
const isSubject = s => /^[A-Z]{2,6}\s+-\s+/.test(s) && !isYear(s);
const isCourse  = (s, code = "") => {
  if (!s || isYear(s) || isSubject(s)) return false;
  if (/^\d{4}[A-Z]?\s+-\s+/.test(s)) return true;
  if (code && new RegExp(`\\(${code}\\)$`, "i").test(s)) return true;
  return /\([A-Z]{2,6}\)$/.test(s);
};

// ── Core in-page helper: scroll virtualscroller ───────────────────────────────

// JS string injected into page.evaluate — scrolls one step and returns true if moved
const SCROLL_FN = `(function(){
  const sels = ['[data-pc-name="virtualscroller"]','.p-virtualscroller','[role="listbox"]','.p-select-list','.p-select-overlay'];
  for(const s of sels){const el=document.querySelector(s);if(el&&el.scrollHeight>el.clientHeight+2){const b=el.scrollTop;el.scrollTop+=Math.max(60,el.clientHeight*0.6);if(el.scrollTop!==b)return true;}}return false;
})()`;

// ── Click an option by text using real Puppeteer mouse events ─────────────────
// element.click() inside page.evaluate doesn't trigger Vue/PrimeNG — must use
// ElementHandle.click() which goes through CDP and dispatches real mouse events.

async function clickOptionByText(page, text, startsWith = false) {
  const opts = await page.$$('[role="option"]');
  for (const opt of opts) {
    const visible = await page.evaluate(el => el.offsetParent !== null, opt);
    if (!visible) continue;
    const t = await page.evaluate(el => el.textContent?.replace(/\s+/g, " ").trim(), opt);
    if (startsWith ? t.startsWith(text) : t === text) {
      await opt.click();
      return true;
    }
  }
  return false;
}

// ── Set year range ────────────────────────────────────────────────────────────

async function setYearRange(page) {
  log(`Setting year range: ${YEAR_START} → ${YEAR_END}`);
  const combos = await page.$$('[role="combobox"]');

  // combobox[0] = year start
  await combos[0].click();
  await sleep(700);
  if (!await clickOptionByText(page, YEAR_START)) warn(`Year start ${YEAR_START} not found`);
  await sleep(600);

  // combobox[1] = year end
  const combos2 = await page.$$('[role="combobox"]');
  await combos2[1].click();
  await sleep(700);
  if (!await clickOptionByText(page, YEAR_END)) warn(`Year end ${YEAR_END} not found`);
  await sleep(600);
  log("Year range set.");
}

// ── Enumerate all options from a dropdown by scrolling ────────────────────────

async function scrollCollect(page, comboIdx, filterFn) {
  const seen = new Set();

  // Real Puppeteer click — triggers Vue data fetch for updated list
  const combos = await page.$$('[role="combobox"]');
  if (!combos[comboIdx]) return [];
  await combos[comboIdx].click();
  await sleep(800);

  // Wait for first option to appear
  try { await page.waitForSelector('[role="option"]', { timeout: 8000 }); } catch { return []; }

  // Scroll to top, then collect everything
  await page.evaluate(() => {
    const sels = ['[data-pc-name="virtualscroller"]','.p-virtualscroller','[role="listbox"]'];
    for(const s of sels){const el=document.querySelector(s);if(el){el.scrollTop=0;break;}}
  });
  await sleep(200);

  let stable = 0, lastCount = -1;
  for (let i = 0; i < 400; i++) {
    const opts = await page.$$eval('[role="option"]', els =>
      els.filter(e => e.offsetParent !== null).map(e => e.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean)
    );
    opts.filter(filterFn).forEach(o => seen.add(o));

    if (seen.size === lastCount) { if (++stable >= 5) break; } else { stable = 0; lastCount = seen.size; }

    const moved = await page.evaluate(SCROLL_FN);
    if (!moved) break;
    await sleep(90);
  }

  // Collect final visible set
  const final = await page.$$eval('[role="option"]', els =>
    els.filter(e => e.offsetParent !== null).map(e => e.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean)
  );
  final.filter(filterFn).forEach(o => seen.add(o));

  await page.keyboard.press("Escape");
  await sleep(300);
  return [...seen];
}

// ── Select a specific option by scrolling until visible, then click ───────────
// Uses Puppeteer ElementHandle.click() (CDP mouse events) — required for Vue/PrimeNG.

async function selectByScroll(page, comboIdx, optionText, retries = 2) {
  const code = optionText.split(" - ")[0].trim();
  const norm  = s => (s || "").replace(/\s+/g, " ").trim();

  for (let attempt = 0; attempt <= retries; attempt++) {
    await page.keyboard.press("Escape");
    await sleep(200);

    // Open dropdown with real Puppeteer click
    const combos = await page.$$('[role="combobox"]');
    if (!combos[comboIdx]) throw new Error(`no combobox[${comboIdx}]`);
    await combos[comboIdx].click();
    await sleep(800);

    // Wait for options panel
    try { await page.waitForSelector('[role="option"]', { timeout: 8000 }); }
    catch { throw new Error(`dropdown ${comboIdx} never opened`); }

    // Reset scroll to top
    await page.evaluate(() => {
      const sels = ['[data-pc-name="virtualscroller"]','.p-virtualscroller','[role="listbox"]','.p-select-list'];
      for (const s of sels) { const el = document.querySelector(s); if (el) { el.scrollTop = 0; break; } }
    });
    await sleep(150);

    let found = false;
    for (let i = 0; i < 400 && !found; i++) {
      // evaluateHandle returns a live JSHandle to the DOM node — no coordinate
      // staleness from double round-trip. ElementHandle.click() uses CDP.
      const handle = await page.evaluateHandle((tgt, q) => {
        const norm = s => (s || "").replace(/\s+/g, " ").trim();
        return Array.from(document.querySelectorAll('[role="option"]'))
          .find(el => el.offsetParent !== null &&
            (norm(el.textContent) === tgt || norm(el.textContent).startsWith(q + " - ")));
      }, optionText, code);

      const el = handle.asElement();
      if (el) {
        await el.click(); // ElementHandle CDP click — triggers Vue
        found = true;
        await handle.dispose();
        break;
      }
      await handle.dispose();

      // Scroll down
      const moved = await page.evaluate(SCROLL_FN);
      if (!moved) break;
      await sleep(80);
    }

    if (!found) {
      const sample = await page.$$eval('[role="option"]', els =>
        els.filter(e => e.offsetParent !== null).slice(0, 5).map(e => e.textContent?.replace(/\s+/g, " ").trim())
      );
      const msg = `not found after scroll; last: ${JSON.stringify(sample)}`;
      warn(`selectByScroll attempt ${attempt + 1} (${optionText}): ${msg}`);
      if (attempt === retries) throw new Error(msg);
      await sleep(400);
    } else {
      await sleep(500);
      return;
    }
  }
}

// ── Table scraping ────────────────────────────────────────────────────────────

const HEADER_MAP = {
  "Academic Year":"Academic Year","Year":"Academic Year","Term":"Term","Subject":"Subject",
  "Course No.":"Course No.","Course Number":"Course No.","Course":"Course No.",
  "Course Title":"Course Title","Title":"Course Title","Instructor":"Instructor","GPA":"GPA",
  "A (%)":"A (%)","A- (%)":"A− (%)","A− (%)":"A− (%)",
  "B+ (%)":"B+ (%)","B (%)":"B (%)","B- (%)":"B− (%)","B− (%)":"B− (%)",
  "C+ (%)":"C+ (%)","C (%)":"C (%)","C- (%)":"C− (%)","C− (%)":"C− (%)",
  "D+ (%)":"D+ (%)","D (%)":"D (%)","D- (%)":"D− (%)","D− (%)":"D− (%)",
  "F (%)":"F (%)","Withdraws":"Withdraws","Withdraw":"Withdraws","W":"Withdraws",
  "Graded Enrollment":"Graded Enrollment","Enrollment":"Graded Enrollment",
  "CRN":"CRN","Credits":"Credits","Credit":"Credits",
};

const GRADES_API = "https://udc.vt.edu/api/irdata/data/courses/grades";

// Fast check: wait for the grades API response, return true if it has data.
// Empty responses ("[]", 2 chars) short-circuit in ~1-2s instead of 18s DOM poll.
async function waitForGradesData(page, timeoutMs = 12000) {
  try {
    const res = await page.waitForResponse(
      r => r.url() === GRADES_API,
      { timeout: timeoutMs }
    );
    const body = await res.text();
    if (!body || body === "[]" || body.length < 5) return false;
    // Data present — wait briefly for DOM table to render
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const ok = await page.evaluate(() => {
        const rows = document.querySelectorAll("table tbody tr");
        return rows.length > 0 && Array.from(rows).some(r => r.querySelectorAll("td").length >= 5);
      });
      if (ok) return true;
      await sleep(200);
    }
    return false;
  } catch {
    return false;
  }
}

async function scrapeCurrentPage(page, subject, course) {
  return page.evaluate((subj, crs, hm, hdrs) => {
    const n = s => (s || "").replace(/\s+/g, " ").trim();
    const ths = Array.from(document.querySelectorAll("table thead th,[role='columnheader']"))
      .map(th => n(th.textContent).replace(/[↑↓⇅↕]/g, "").trim()).filter(Boolean);
    return Array.from(document.querySelectorAll("table tbody tr")).map(tr => {
      const cells = Array.from(tr.querySelectorAll("td")).map(td => n(td.textContent));
      if (!cells.length || cells.every(c => !c)) return null;
      const obj = {}; hdrs.forEach(h => { obj[h] = ""; });
      ths.forEach((h, i) => { const k = h.replace(/−/g,"-"); const d = hm[k]||hm[h]; if(d) obj[d]=cells[i]||""; });
      if (!obj["Subject"]) obj["Subject"] = subj.split(" - ")[0]||subj;
      if (!obj["Course No."]) { const m=crs.match(/\b\d{4}[A-Z]?\b/); if(m) obj["Course No."]=m[0]; }
      if (!obj["Course Title"]) obj["Course Title"] = crs;
      return obj;
    }).filter(Boolean);
  }, subject, course, HEADER_MAP, HEADERS);
}

async function getPagingInfo(page) {
  return page.evaluate(() => {
    const m = document.body.innerText.match(/Showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)/i);
    return m ? { start:+m[1], end:+m[2], total:+m[3] } : null;
  });
}

async function goNextPage(page) {
  const btn = await page.$('button[aria-label="Next Page"]:not([disabled]):not(.p-disabled),button[title="Next Page"]:not([disabled])');
  if (!btn) return false;
  const before = JSON.stringify(await getPagingInfo(page));
  await btn.click();
  for (let i = 0; i < 25; i++) {
    await sleep(600);
    if (JSON.stringify(await getPagingInfo(page)) !== before) return true;
  }
  return false;
}

async function scrapeAllPages(page, subject, course) {
  const allRows = [];
  const seen = new Set();
  for (let p = 0; p < 500; p++) {
    // First page: already know data exists (caller checked waitForGradesData)
    // Subsequent pages: just wait for DOM table update after pagination click
    if (p > 0) {
      const deadline = Date.now() + 8000;
      let ok = false;
      while (Date.now() < deadline) {
        ok = await page.evaluate(() => {
          const rows = document.querySelectorAll("table tbody tr");
          return rows.length > 0 && Array.from(rows).some(r => r.querySelectorAll("td").length >= 5);
        });
        if (ok) break;
        await sleep(200);
      }
      if (!ok) { warn(`Table not ready (page ${p}): ${course}`); break; }
    }
    await sleep(200);
    const rows = await scrapeCurrentPage(page, subject, course);
    const info = await getPagingInfo(page);
    const sig  = JSON.stringify({ info, first: rows[0], count: rows.length });
    if (seen.has(sig)) break;
    seen.add(sig);
    allRows.push(...rows);
    if (!info || info.end >= info.total) break;
    if (!await goNextPage(page)) break;
  }
  return allRows;
}

// ── Browser session management ────────────────────────────────────────────────

let _browser = null;
let _page    = null;

const isDisconnected = err =>
  err && /Session closed|Target closed|Connection closed|Protocol error.*session/i.test(err.message);

async function launchSession() {
  if (_browser) { try { await _browser.close(); } catch {} }
  _browser = await puppeteer.launch({
    headless: HEADLESS ? "new" : false,
    defaultViewport: { width: 1440, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  _page = await _browser.newPage();
  _page.setDefaultTimeout(30000);
  _page.on("console", () => {});
  _page.on("pageerror", () => {});
  log(`Navigating to ${UDC_URL}`);
  await _page.goto(UDC_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3000);
  await setYearRange(_page);
  return _page;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  ensureDirs();
  const progress = loadProgress();
  log(`Progress: ${progress.done.length} subjects already done`);

  let page = await launchSession();

  // ── Enumerate subjects ───────────────────────────────────────────────────────
  log("Enumerating subjects (scroll-based)...");
  const subjects = (await scrollCollect(page, 2, isSubject)).sort();
  log(`Found ${subjects.length} subjects.`);

  const toScrape = FORCE_SUBJ
    ? subjects.filter(s => s.startsWith(FORCE_SUBJ))
    : subjects.filter(s => !progress.done.includes(s));
  log(`To scrape: ${toScrape.length} (${subjects.length - toScrape.length} done)`);

  // ── Subject loop ─────────────────────────────────────────────────────────────
  for (let si = 0; si < toScrape.length; si++) {
    const subject = toScrape[si];
    const code    = subject.split(" - ")[0].trim().toUpperCase();
    log(`\n══ [${si + 1}/${toScrape.length}] ${subject} ══`);

    // Select subject — restart browser if session crashed
    let subjectOk = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await selectByScroll(page, 2, subject);
        await sleep(1200);
        subjectOk = true;
        break;
      } catch (err) {
        if (isDisconnected(err)) {
          warn(`Browser crashed on subject select, restarting... (attempt ${attempt + 1})`);
          page = await launchSession();
        } else {
          warn(`Subject select failed (${subject}): ${err.message}`);
          break;
        }
      }
    }
    if (!subjectOk) continue;

    // ── Enumerate courses ──────────────────────────────────────────────────────
    let courses = [];
    try {
      courses = await scrollCollect(page, 3, s => isCourse(s, code));
    } catch (err) {
      if (isDisconnected(err)) {
        warn(`Browser crashed during course enumeration, restarting...`);
        page = await launchSession();
      }
      continue;
    }
    log(`  ${courses.length} courses`);

    if (!courses.length) {
      warn(`  No courses for ${subject}`);
      markDone(progress, subject);
      continue;
    }

    // ── Course loop ────────────────────────────────────────────────────────────
    const subjectRows = [];
    let courseScrollTop = 0; // Progressive: resume dropdown where we left off

    for (let ci = 0; ci < courses.length; ci++) {
      const course = courses[ci];
      log(`  [${ci + 1}/${courses.length}] ${course}`);

      // Register listener BEFORE clicking so we never miss the response.
      const responsePromise = page.waitForResponse(
        r => r.url() === GRADES_API,
        { timeout: 3000 }
      ).catch(() => null);

      // Open dropdown, restore scroll position, find course in 1-3 steps
      let courseFound = false;
      try {
        await page.keyboard.press("Escape"); await sleep(80);
        const combos = await page.$$('[role="combobox"]');
        if (!combos[3]) throw new Error("no course combobox");
        await combos[3].click();
        await sleep(350);
        await page.waitForSelector('[role="option"]', { timeout: 5000 });

        // Restore scroll to where previous course was — next course is 0-3 steps ahead
        await page.evaluate(top => {
          const sels = ['[data-pc-name="virtualscroller"]','.p-virtualscroller','[role="listbox"]','.p-select-list'];
          for (const s of sels) { const el = document.querySelector(s); if (el) { el.scrollTop = top; break; } }
        }, courseScrollTop);
        await sleep(80);

        for (let si = 0; si < 30; si++) {
          const handle = await page.evaluateHandle((tgt, q) => {
            const norm = s => (s || "").replace(/\s+/g, " ").trim();
            return Array.from(document.querySelectorAll('[role="option"]'))
              .find(el => el.offsetParent !== null &&
                (norm(el.textContent) === tgt || norm(el.textContent).startsWith(q + " - ")));
          }, course, code);

          const el = handle.asElement();
          if (el) {
            courseScrollTop = await page.evaluate(() => {
              const sels = ['[data-pc-name="virtualscroller"]','.p-virtualscroller','[role="listbox"]','.p-select-list'];
              for (const s of sels) { const e = document.querySelector(s); if (e) return e.scrollTop; }
              return 0;
            });
            await el.click();
            courseFound = true;
            await handle.dispose();
            break;
          }
          await handle.dispose();
          const moved = await page.evaluate(SCROLL_FN);
          if (!moved) break;
          await sleep(60);
        }
      } catch (err) {
        if (isDisconnected(err)) {
          warn(`    Browser crashed on course select, restarting...`);
          page = await launchSession();
          courseScrollTop = 0;
          try { await selectByScroll(page, 2, subject); await sleep(2000); } catch {}
        } else {
          warn(`    Course select failed (${course}): ${err.message}`);
        }
        continue;
      }

      if (!courseFound) {
        warn(`    Course not found: ${course}`);
        await page.keyboard.press("Escape"); await sleep(80);
        continue;
      }

      try {
        const res = await responsePromise;
        if (!res) continue; // timeout = no data
        const body = await res.text();
        if (!body || body === "[]" || body.length < 5) continue;
        // Data present — wait for DOM table
        const deadline = Date.now() + 8000;
        let tableReady = false;
        while (Date.now() < deadline) {
          tableReady = await page.evaluate(() => {
            const rows = document.querySelectorAll("table tbody tr");
            return rows.length > 0 && Array.from(rows).some(r => r.querySelectorAll("td").length >= 5);
          });
          if (tableReady) break;
          await sleep(200);
        }
        if (!tableReady) continue;
        const rows = await scrapeAllPages(page, subject, course);
        subjectRows.push(...rows);
        if (rows.length) log(`    ✓ ${rows.length} rows`);
      } catch (err) {
        if (isDisconnected(err)) {
          warn(`    Browser crashed during scrape, restarting...`);
          page = await launchSession();
          try { await selectByScroll(page, 2, subject); await sleep(2000); } catch {}
        } else {
          warn(`    Scrape error (${course}): ${err.message}`);
        }
      }
      await sleep(100);
    }

    writeCSV(subjectRows, subject);
    markDone(progress, subject);
    log(`  Done: ${subject} — ${subjectRows.length} total rows`);
    if (FORCE_SUBJ) break;
  }

  log("\nAll done.");
  try { await _browser.close(); } catch {}
}

main().catch(err => { console.error("[FATAL]", err); process.exit(1); });

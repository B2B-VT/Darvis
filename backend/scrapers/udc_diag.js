#!/usr/bin/env node
"use strict";
const puppeteer = require("puppeteer");
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  await page.goto("https://udc.vt.edu/irdata/data/courses/grades", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2000);

  // Set year start 2020-21
  const c0 = await page.$$('[role="combobox"]');
  console.log("Initial combobox count:", c0.length);
  await c0[0].click(); await sleep(700);
  const opts0 = await page.$$('[role="option"]');
  for (const o of opts0) { const t = await page.evaluate(e => e.textContent?.trim(), o); if (t === "2020-21") { await o.click(); break; } }
  await sleep(600);

  // Set year end 2025-26
  const c1 = await page.$$('[role="combobox"]');
  await c1[1].click(); await sleep(700);
  const opts1 = await page.$$('[role="option"]');
  for (const o of opts1) { const t = await page.evaluate(e => e.textContent?.trim(), o); if (t === "2025-26") { await o.click(); break; } }
  await sleep(600);
  console.log("Year range set.");

  // Select ECE subject
  const combosBeforeSubj = await page.$$('[role="combobox"]');
  console.log("Comboboxes before subject select:", combosBeforeSubj.length);
  await combosBeforeSubj[2].click(); await sleep(800);
  await page.waitForSelector('[role="option"]', { timeout: 8000 });

  // Scroll to find ECE
  for (let i = 0; i < 100; i++) {
    const found = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('[role="option"]')).filter(e => e.offsetParent !== null);
      const m = opts.find(o => o.textContent?.includes("ECE"));
      if (m) { const r = m.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; }
      return null;
    });
    if (found) { await page.mouse.click(found.x, found.y); break; }
    await page.evaluate(() => { const el = document.querySelector('[data-pc-name="virtualscroller"]'); if(el) el.scrollTop += 200; });
    await sleep(80);
  }
  await sleep(2000);

  // Check comboboxes after subject select
  const combosAfter = await page.$$('[role="combobox"]');
  console.log("Comboboxes after subject select:", combosAfter.length);
  for (let i = 0; i < combosAfter.length; i++) {
    const t = await page.evaluate(e => e.textContent?.replace(/\s+/g,' ').trim(), combosAfter[i]);
    console.log(`  combobox[${i}]: "${t}"`);
  }

  // Open course dropdown (combobox[3])
  console.log("\nOpening combobox[3] for courses...");
  await combosAfter[3].click(); await sleep(1500);
  try { await page.waitForSelector('[role="option"]', { timeout: 8000 }); } catch { console.log("No options appeared in 8s!"); await browser.close(); return; }

  const visibleOpts = await page.$$eval('[role="option"]', els =>
    els.filter(e => e.offsetParent !== null).map(e => e.textContent?.replace(/\s+/g,' ').trim())
  );
  console.log(`\n${visibleOpts.length} visible options in course dropdown:`);
  visibleOpts.slice(0, 15).forEach((o, i) => console.log(`  [${i}] "${o}"`));

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/**
 * Intercepts all network requests while selecting CS on the UDC page.
 * Prints every XHR/fetch URL + response body so we can find the grade data API.
 */
"use strict";

const puppeteer = require("puppeteer");

const UDC_URL = "https://udc.vt.edu/irdata/data/courses/grades";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function clickOptionByText(page, text) {
  const opts = await page.$$('[role="option"]');
  for (const opt of opts) {
    const visible = await page.evaluate(el => el.offsetParent !== null, opt);
    if (!visible) continue;
    const t = await page.evaluate(el => el.textContent?.replace(/\s+/g, " ").trim(), opt);
    if (t === text || t.startsWith(text)) { await opt.click(); return true; }
  }
  return false;
}

async function selectByScroll(page, comboIdx, optionText) {
  const code = optionText.split(" - ")[0].trim();
  const combos = await page.$$('[role="combobox"]');
  await combos[comboIdx].click();
  await sleep(800);
  await page.waitForSelector('[role="option"]', { timeout: 8000 });
  await page.evaluate(() => {
    const sels = ['[data-pc-name="virtualscroller"]','.p-virtualscroller','[role="listbox"]'];
    for (const s of sels) { const el = document.querySelector(s); if (el) { el.scrollTop = 0; break; } }
  });
  await sleep(150);

  for (let i = 0; i < 400; i++) {
    const opts = await page.$$('[role="option"]');
    for (const opt of opts) {
      const visible = await page.evaluate(el => el.offsetParent !== null, opt);
      if (!visible) continue;
      const t = (await page.evaluate(el => el.textContent, opt)).replace(/\s+/g, " ").trim();
      if (t === optionText || t.startsWith(code + " - ")) { await opt.click(); return; }
    }
    const moved = await page.evaluate(() => {
      const sels = ['[data-pc-name="virtualscroller"]','.p-virtualscroller','[role="listbox"]'];
      for (const s of sels) { const el = document.querySelector(s); if (el && el.scrollHeight > el.clientHeight + 2) {
        const b = el.scrollTop; el.scrollTop += Math.max(60, el.clientHeight * 0.6); return el.scrollTop !== b;
      }} return false;
    });
    if (!moved) break;
    await sleep(80);
  }
  throw new Error(`${optionText} not found`);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();

  const captured = [];

  // Intercept all responses from udc.vt.edu
  page.on("response", async res => {
    const url = res.url();
    const ct  = res.headers()["content-type"] || "";
    if (url.includes("udc.vt.edu") && !url.endsWith(".js") && !url.endsWith(".css") && !url.includes("chunk")) {
      try {
        const body = await res.text();
        captured.push({ url, status: res.status(), ct, body: body.slice(0, 2000) });
      } catch {}
    }
  });

  console.log("Navigating...");
  await page.goto(UDC_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2000);

  console.log("Setting year 2020-21...");
  const c0 = await page.$$('[role="combobox"]');
  await c0[0].click(); await sleep(700);
  await clickOptionByText(page, "2020-21"); await sleep(600);

  console.log("Selecting CS...");
  await selectByScroll(page, 2, "CS - Computer Science");
  await sleep(3000);

  console.log("Selecting course 3114...");
  const combos = await page.$$('[role="combobox"]');
  await combos[3].click(); await sleep(800);
  await page.waitForSelector('[role="option"]', { timeout: 8000 });
  await clickOptionByText(page, "3114");
  await sleep(4000);

  console.log("\n=== CAPTURED REQUESTS ===");
  for (const r of captured) {
    console.log(`\nURL: ${r.url}`);
    console.log(`Status: ${r.status} | Content-Type: ${r.ct}`);
    console.log(`Body: ${r.body}`);
    console.log("---");
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });

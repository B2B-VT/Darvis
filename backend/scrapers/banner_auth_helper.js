#!/usr/bin/env node
/**
 * VT Banner authentication helper.
 *
 * Launches a visible Chrome window so you can log into Hokie SPA + complete Duo.
 * Once logged in, extracts session cookies and writes BANNER_COOKIE to backend/.env.
 * Those cookies are then used by banner_timetable_scraper.js to get instructor
 * names and seat availability (data not visible in the public timetable).
 *
 * Run once (or when cookies expire):
 *   cd backend && node scrapers/banner_auth_helper.js
 *
 * Cookies typically last ~8 hours. Re-run when GitHub Actions scrape shows
 * 0 instructors or seat data stops updating.
 */
'use strict';

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

const ENV_PATH      = path.join(__dirname, '../.env');
const BANNER_LOGIN  = 'https://selfservice.banner.vt.edu/ssb/twbkwbis.P_WWWLogin';
const LOGIN_TIMEOUT = 3 * 60 * 1000; // 3 minutes for Duo approval

async function main() {
  console.log('Launching browser — log in to Hokie SPA and complete Duo...');
  console.log(`URL: ${BANNER_LOGIN}`);

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1200,800'],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.goto(BANNER_LOGIN, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('\nWaiting for login + Duo (up to 3 minutes)...');

  // Wait until URL leaves the login/CAS pages
  await page.waitForFunction(
    () => !window.location.href.includes('cas.') &&
          !window.location.href.includes('login') &&
          !window.location.href.includes('duo'),
    { timeout: LOGIN_TIMEOUT, polling: 1000 }
  ).catch(async () => {
    // Fallback: wait for any Banner menu element
    await page.waitForSelector('table, .authContainer, #twbkwbis', { timeout: 30000 });
  });

  const cookies = await page.cookies();
  if (!cookies.length) {
    console.error('No cookies found — did login complete? Try running again.');
    await browser.close();
    process.exit(1);
  }

  const cookieStr   = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const cookieNames = cookies.map(c => c.name).join(', ');
  console.log(`\nCookies captured: ${cookieNames}`);

  // Write / update BANNER_COOKIE in backend/.env
  if (fs.existsSync(ENV_PATH)) {
    let env = fs.readFileSync(ENV_PATH, 'utf8');
    if (/^BANNER_COOKIE=/m.test(env)) {
      env = env.replace(/^BANNER_COOKIE=.*/m, `BANNER_COOKIE=${cookieStr}`);
    } else {
      env = env.trimEnd() + `\nBANNER_COOKIE=${cookieStr}\n`;
    }
    fs.writeFileSync(ENV_PATH, env);
    console.log('BANNER_COOKIE written to backend/.env');
  } else {
    console.log(`\nNo backend/.env found. Add this line manually:\nBANNER_COOKIE=${cookieStr}`);
  }

  await browser.close();
  console.log('\nDone. Run the scraper now:');
  console.log('  NO_DELETE=true npm run scrape-timetable');
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

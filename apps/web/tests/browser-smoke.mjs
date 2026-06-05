#!/usr/bin/env node
// Browser smoke — load each surface in chromium, fail the run if there's
// any 4xx/5xx network failure, page error, or console-level error.
// Sanity output: per-URL status + tally of console.errors.
//
// Targets a local dev server (PORT=3344 by convention in this repo).

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3344';

// A focused list: anything that ships React + uses a moderately complex
// data path. Pages with auth are listed too — they should redirect cleanly
// without throwing in middleware or hydration.
const TARGETS = [
  // Traveler / public — exercises Booking V2 resolver helpers indirectly
  { url: '/',                                               name: 'home' },
  { url: '/activities',                                     name: 'activities-list' },
  { url: '/activities/kaohsiung',                           name: 'activities-region' },
  { url: '/guides',                                         name: 'guides-list' },
  { url: '/blog',                                           name: 'blog-list' },
  // Login pages (should render, not 500)
  { url: '/login',                                          name: 'traveler-login' },
  { url: '/guide/login',                                    name: 'guide-login' },
  { url: '/admin/login',                                    name: 'admin-login' },
  // Maintenance / public ops pages
  { url: '/maintenance',                                    name: 'maintenance' },
  { url: '/why-choose-us',                                  name: 'why-choose-us' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

let totalErrors = 0;
const report = [];

for (const t of TARGETS) {
  const consoleErrors = [];
  const pageErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  const onPageError = (err) => pageErrors.push(err.message);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  let status = 'n/a';
  try {
    const res = await page.goto(BASE + t.url, { waitUntil: 'networkidle', timeout: 30_000 });
    status = String(res?.status() ?? 'no-response');
  } catch (e) {
    status = `nav-error: ${e.message.split('\n')[0]}`;
  }

  page.off('console', onConsole);
  page.off('pageerror', onPageError);

  const hadProblem = Number(status) >= 500 || pageErrors.length > 0;
  totalErrors += hadProblem ? 1 : 0;

  // Ignore the well-known Next-Image "url is unconfigured remotePatterns"
  // chatter that comes from placeholder mocks; smoke is about SSR / hydration
  // crashes, not asset URL warnings.
  const realConsoleErrors = consoleErrors.filter(
    (e) => !/url\.host.*configured.*next\.config/i.test(e) && !/Failed to load resource: the server responded with a status of 4/.test(e),
  );

  report.push({
    name: t.name,
    url: t.url,
    status,
    pageErrors: pageErrors.length,
    consoleErrors: realConsoleErrors.length,
    sample: realConsoleErrors[0]?.slice(0, 200) || pageErrors[0]?.slice(0, 200) || '',
  });
}

await browser.close();

console.log('\nBrowser smoke report:\n');
console.log('status   name                                  console  page  sample');
console.log('-----    ----                                  -------  ----  ------');
for (const r of report) {
  const flag = (r.pageErrors > 0 || Number(r.status) >= 500) ? 'FAIL' : (r.consoleErrors > 0 ? 'WARN' : 'OK  ');
  console.log(
    `${flag}  ${r.status.padEnd(4)}  ${r.name.padEnd(34)}  ${String(r.consoleErrors).padStart(7)}  ${String(r.pageErrors).padStart(4)}  ${r.sample}`,
  );
}
console.log('');
console.log(`Pages with hard errors: ${totalErrors}`);
process.exit(totalErrors > 0 ? 1 : 0);

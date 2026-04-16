#!/usr/bin/env node
import fs from 'fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://tour-platform-nine.vercel.app';

function normalizeRegionSlug(region, regionSlug) {
  if (regionSlug && regionSlug.trim()) return regionSlug.trim();
  const map = {
    '台北市': 'taipei', '台北': 'taipei',
    '新北市': 'new-taipei', '桃園市': 'taoyuan', '台中市': 'taichung',
    '台南市': 'tainan', '高雄市': 'kaohsiung', '高雄': 'kaohsiung',
    '花蓮縣': 'hualien', '花蓮': 'hualien'
  };
  return map[region?.trim()] || 'taiwan';
}

function buildActivityPath(region, regionSlug, slug) {
  const regionPart = encodeURIComponent(normalizeRegionSlug(region, regionSlug));
  return `/activities/${regionPart}/${encodeURIComponent(slug)}`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

function parseFixtureActivities() {
  const content = fs.readFileSync('apps/web/src/fixtures/data.ts', 'utf8');
  const start = content.indexOf('export const activities =');
  if (start < 0) return [];
  const open = content.indexOf('[', start);
  const close = content.indexOf('];', open);
  if (open < 0 || close < 0) return [];
  const block = content.slice(open, close + 2);
  const slugMatches = [...block.matchAll(/\bslug:\s*'([^']+)'/g)].map((m) => m[1]);
  return slugMatches;
}

async function getDbActivities() {
  const data = await fetchJson(`${BASE}/api/activities`);
  if (!data.ok) throw new Error('failed to load activities list');
  return data.data || [];
}

function pickFixtureSlug(dbActivities, fixtureSlugs) {
  const dbSet = new Set((dbActivities || []).map((a) => a.slug));
  const fixtureUnique = [...new Set(fixtureSlugs)];
  const fallback = fixtureUnique.find((s) => !dbSet.has(s));
  return fallback || fixtureUnique[0] || 'playwright-e2e-1775872569478-1775872569552';
}

async function runFlow(page, slug, kind, region = 'taiwan', regionSlug = '') {
  const detailPath = buildActivityPath(region, regionSlug, slug);
  const detailUrl = `${BASE}${detailPath}`;

  const detailStart = Date.now();
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByTestId('activity-detail-title').waitFor({ timeout: 60000 });
  const detailMs = Date.now() - detailStart;
  const title = (await page.getByTestId('activity-detail-title').textContent()) || '(no-title)';

  const checkoutBtn = page.getByTestId('begin-checkout-btn');
  await checkoutBtn.waitFor({ timeout: 10000 });
  const href = await checkoutBtn.getAttribute('href');

  const checkoutUrl = href ? `${BASE}${href}` : `${BASE}/checkout?slug=${encodeURIComponent(slug)}`;
  const checkoutStart = Date.now();

  await Promise.all([
    page.waitForURL((url) => url.href.includes('/checkout') || url.href.includes('/booking'), { timeout: 60000 }),
    checkoutBtn.click({ timeout: 10000 })
  ]);

  let checkoutMs = Date.now() - checkoutStart;
  let route = new URL(page.url()).pathname;

  if (route.startsWith('/booking/')) {
    await page.getByText('行程確認', { exact: false }).first().waitFor({ timeout: 60000 });
  } else {
    await page.getByTestId('create-order-btn').first().waitFor({ timeout: 60000 });
  }
  checkoutMs = Date.now() - checkoutStart;

  const bodyText = await page.locator('body').innerText();
  const stable = !/載入中\.\.\./.test(bodyText) && !/Loading/.test(bodyText);

  return {
    kind,
    slug,
    detailPath,
    detailMs,
    title: title.trim(),
    checkoutUrl,
    checkoutMs,
    stableAfterNav: stable,
    nextPath: route,
  };
}

async function main() {
  const dbActivities = await getDbActivities();
  const dbSlug = dbActivities?.[0]?.slug;
  const dbRegion = dbActivities?.[0]?.region || '台灣';
  const dbRegionSlug = dbActivities?.[0]?.regionSlug || normalizeRegionSlug(dbRegion);

  const fixtureSlugs = parseFixtureActivities();
  const fixtureSlug = pickFixtureSlug(dbActivities, fixtureSlugs);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  if (!dbSlug) throw new Error('DB slug not found');

  const flows = [
    () => runFlow(page, dbSlug, 'db', dbRegion, dbRegionSlug),
    () => runFlow(page, fixtureSlug, 'fixture', 'taiwan', 'taiwan')
  ];

  const results = [];
  for (const flow of flows) {
    results.push(await flow());
  }
  for (const r of results) {
    console.log(`[${r.kind}] slug=${r.slug}`);
    console.log(`  detail: ${r.detailPath} -> ${r.detailMs}ms, title=${r.title}`);
    console.log(`  checkout: ${r.nextPath} -> ${r.checkoutMs}ms, stable=${r.stableAfterNav}`);
  }

  await browser.close();

  const fails = results.some((r) => !r.title || !r.stableAfterNav);
  if (fails) {
    console.error('SMOKE_FAIL');
    process.exit(1);
  }
  console.log('SMOKE_PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

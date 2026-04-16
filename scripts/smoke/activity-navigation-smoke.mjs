#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'fs';

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
  return fallback || fixtureUnique[0] || 'activity-1770000000000';
}

async function runCase(page, slug, kind, region = 'taiwan', regionSlug = '') {
  const path = buildActivityPath(region, regionSlug, slug);
  const start = Date.now();

  const detailUrl = `${BASE}${path}`;
  const det = await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
  const ttfb = Date.now() - start;
  const status = det?.status?.() || 0;

  await page.getByTestId('activity-detail-title').waitFor({ timeout: 12000 });
  const title = await page.getByTestId('activity-detail-title').textContent();
  const checkoutHref = await page.getByTestId('begin-checkout-btn').getAttribute('href');

  const checkoutStart = Date.now();
  const checkoutUrl = `${BASE}${checkoutHref}`;
  await Promise.all([
    page.goto(checkoutUrl, { waitUntil: 'domcontentloaded' }),
    page.getByText('行程確認').waitFor({ timeout: 12000 }),
  ]);
  const checkoutMs = Date.now() - checkoutStart;

  const bookingText = await page.locator('main').first().textContent();
  return {
    kind,
    slug,
    detailPath: path,
    detailStatus: status,
    detailTTFBMs: ttfb,
    title: title?.trim() || '(no title)',
    checkoutMs,
    bookingContains: bookingText.includes('載入行程資料中') ? 'loading-shown' : 'ready',
    hasCheckout: !!checkoutHref,
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

  const results = [];

  if (!dbSlug) {
    throw new Error('DB slug not found');
  }

  results.push(await runCase(page, dbSlug, 'db', dbRegion, dbRegionSlug));

  const fixturePath = `/activities/taiwan/${encodeURIComponent(fixtureSlug)}`;
  results.push(await runCase(page, fixtureSlug, 'fixture', 'taiwan', 'taiwan'));

  console.log('E2E smoke results:');
  for (const item of results) {
    console.log(`[${item.kind}] slug=${item.slug}`);
    console.log(`  detail: ${item.detailPath} -> ${item.detailStatus} (${item.detailTTFBMs}ms)`);
    console.log(`  title: ${item.title}`);
    console.log(`  checkout: ${item.checkoutMs}ms, booking state: ${item.bookingContains}`);
    console.log(`  checkoutHref: ${item.hasCheckout ? 'ok' : 'MISSING'}`);
  }

  await browser.close();

  const fails = results.some((r) => r.detailStatus !== 200 || !r.hasCheckout || r.title.includes('undefined'));
  if (fails) {
    console.error('SMOKE_FAIL');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

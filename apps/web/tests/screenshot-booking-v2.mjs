#!/usr/bin/env node
// Take before/after screenshots of the V2 booking step=1 panel
// at mobile (375) and desktop (1280) widths.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '__screenshots__');
await mkdir(OUT, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:3333';
const URL = '/booking/activity-1780038051379?plan=669216c2-e214-416d-9b6d-0622c102f7f4&date=2026-06-01&scheduleId=d7096f9b-6162-4b6e-b50e-6c23bd2ce627';

// Minimal mocks so the V2 step=1 panel renders even without a real DB.
async function mockApi(page) {
  // Fallthrough first (most generic), specific overrides registered after.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: null }) }));

  const activity = {
    id: 'activity-1780038051379', slug: 'demo-tour', title: '柴山祕境洞窟探險',
    priceTwd: 1200, priceLabel: 'NT$1,200 / 每人',
    durationDisplay: '3 小時', region: '高雄',
    coverImageUrl: '/images/activities/chaishan/main.jpg',
    minParticipants: 2, maxParticipants: 8,
    refundRules: ['出團 168 小時前可全額退款'],
    schedules: [], guide: { displayName: '阿明導遊' },
  };

  await page.route('**/api/activities/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: activity }) }));
  await page.route('**/api/v2/activities/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, data: {
        activity,
        plans: [{ id: '669216c2-e214-416d-9b6d-0622c102f7f4', name: '經典方案', basePrice: 1200, priceType: 'per_person', minParticipants: 2, maxParticipants: 8, bookingType: 'scheduled', status: 'active' }],
      }
    }) }));
  await page.route('**/api/v2/availability**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, data: { slots: [{ startAt: '2026-06-01T01:00:00Z', endAt: '2026-06-01T04:00:00Z', capacityLeft: 6, scheduleId: 'd7096f9b-6162-4b6e-b50e-6c23bd2ce627' }] }
    }) }));
}

const browser = await chromium.launch();
try {
  for (const w of [{ name: 'mobile-375', width: 375, height: 812 }, { name: 'desktop-1280', width: 1280, height: 900 }]) {
    const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await mockApi(page);
    try {
      await page.goto(BASE + URL, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(800);
    } catch (e) { console.error(`nav fail ${w.name}: ${e.message}`); }
    const file = path.join(OUT, `booking-v2-step1--${w.name}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch((e) => console.error(`screenshot fail: ${e.message}`));
    console.log(`✓ ${file}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

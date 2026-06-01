#!/usr/bin/env node
// Screenshot the guide back-office at 375 / 768 / 1280 widths.
// Mocks /api/guide/* so the pages render rich data without a real DB.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '__screenshots__/guide');
await mkdir(OUT, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:3344';

const PAGES = [
  { route: '/guide/dashboard',    name: 'dashboard' },
  { route: '/guide/availability', name: 'availability' },
  { route: '/guide/schedules',    name: 'schedules' },
  { route: '/guide/bookings',     name: 'bookings' },
  { route: '/guide/profile',      name: 'profile' },
];

const VIEWPORTS = [
  { name: 'mobile-375',  width: 375,  height: 812 },
  { name: 'tablet-768',  width: 768,  height: 900 },
  { name: 'desktop-1280',width: 1280, height: 900 },
];

const DASHBOARD_DATA = {
  monthlyBookings: 12,
  pendingBookings: [
    { id: 'b1', guestName: '王小明',  partySize: 2, status: 'confirmed',       createdAt: '2026-05-25', tourTitle: '柴山祕境洞窟探險', totalTwd: 2400 },
    { id: 'b2', guestName: '陳大華',  partySize: 4, status: 'pending_payment', createdAt: '2026-05-26', tourTitle: '北投溫泉夜遊',    totalTwd: 3600 },
    { id: 'b3', guestName: '林雅婷',  partySize: 1, status: 'confirmed',       createdAt: '2026-05-27', tourTitle: '猴硐貓村漫步',    totalTwd: 800  },
  ],
  upcomingSchedules: [
    { id: 's1', tourTitle: '柴山祕境洞窟探險', date: '2026-06-01T01:00:00Z', planId: '經典方案', bookedCount: 3, maxCapacity: 8, status: 'open' },
    { id: 's2', tourTitle: '北投溫泉夜遊',    date: '2026-06-03T10:00:00Z', planId: '標準方案', bookedCount: 8, maxCapacity: 8, status: 'full' },
  ],
  monthGmvTwd: 28800,
  monthGmvOrderCount: 12,
  revenueTrend6m: [
    { month: '2025-12', gmvTwd: 18000, orderCount: 7  },
    { month: '2026-01', gmvTwd: 22000, orderCount: 9  },
    { month: '2026-02', gmvTwd: 25000, orderCount: 10 },
    { month: '2026-03', gmvTwd: 30000, orderCount: 12 },
    { month: '2026-04', gmvTwd: 27000, orderCount: 11 },
    { month: '2026-05', gmvTwd: 28800, orderCount: 12 },
  ],
  expectedPayoutTwd: 24480, nextPayoutDate: '2026-06-08',
  currentBalanceTwd: 16320, lastSettledAt: null, minWithdrawalTwd: 5000, pendingPayoutTwd: 0,
  settlementRulesVersion: 'v1',
  pendingSettlementOrders: [
    { orderId: 'ord-abcdef12-foo', tourTitle: '北投溫泉夜遊', scheduleDate: '2026-05-20T10:00:00Z', totalTwd: 1800, status: 'refund_pending' },
  ],
};

const SCHEDULES_DATA = [
  { id: 's1', activityId: 'a1', tourTitle: '柴山祕境洞窟探險', planName: '經典方案',   date: '2026-06-01T01:00:00Z', endAt: '2026-06-01T04:00:00Z', capacity: 8, bookedCount: 3, status: 'open',      guideNote: null },
  { id: 's2', activityId: 'a2', tourTitle: '北投溫泉夜遊',    planName: '標準方案',   date: '2026-06-03T10:00:00Z', endAt: '2026-06-03T13:00:00Z', capacity: 8, bookedCount: 8, status: 'full',      guideNote: null },
  { id: 's3', activityId: 'a3', tourTitle: '猴硐貓村漫步',    planName: '單人方案',   date: '2026-06-05T01:00:00Z', endAt: '2026-06-05T03:00:00Z', capacity: 6, bookedCount: 0, status: 'cancelled', guideNote: null },
];

const BOOKINGS_DATA = [
  { id: 'b1', guestName: '王小明', maskedEmail: 'w***@example.com', scheduleDate: '2026-06-01T01:00:00Z', planId: 'p1', tourTitle: '柴山祕境洞窟探險', partySize: 2, status: 'confirmed',       paymentStatus: 'paid',   totalTwd: 2400, createdAt: '2026-05-25' },
  { id: 'b2', guestName: '陳大華', maskedEmail: 'c***@example.com', scheduleDate: '2026-06-03T10:00:00Z', planId: 'p2', tourTitle: '北投溫泉夜遊',    partySize: 4, status: 'pending_payment', paymentStatus: 'unpaid', totalTwd: 3600, createdAt: '2026-05-26' },
  { id: 'b3', guestName: '林雅婷', maskedEmail: 'l***@example.com', scheduleDate: '2026-06-05T01:00:00Z', planId: 'p3', tourTitle: '猴硐貓村漫步',    partySize: 1, status: 'cancelled',       paymentStatus: 'refunded', totalTwd: 800, createdAt: '2026-05-22' },
];

const AVAILABILITY_PLANS = [
  { activityId: 'a1', activityTitle: '柴山祕境洞窟探險', planId: 'p1', planName: '經典方案', minParticipants: 2, maxParticipants: 8 },
  { activityId: 'a2', activityTitle: '北投溫泉夜遊',    planId: 'p2', planName: '標準方案', minParticipants: 2, maxParticipants: 8 },
];

const AVAILABILITY_RULES = [
  { id: 'r1', guide_id: 'g1', activity_plan_id: 'p1', weekday: 1, start_time_local: '09:00', end_time_local: '12:00', slot_interval_minutes: 60, buffer_before_minutes: 15, buffer_after_minutes: 15, is_active: true,  effective_from: null, effective_to: null, activity_plans: { name: '經典方案' } },
  { id: 'r2', guide_id: 'g1', activity_plan_id: 'p1', weekday: 3, start_time_local: '14:00', end_time_local: '17:00', slot_interval_minutes: 60, buffer_before_minutes: 15, buffer_after_minutes: 15, is_active: true,  effective_from: null, effective_to: null, activity_plans: { name: '經典方案' } },
  { id: 'r3', guide_id: 'g1', activity_plan_id: 'p2', weekday: 5, start_time_local: '18:00', end_time_local: '21:00', slot_interval_minutes: 60, buffer_before_minutes: 15, buffer_after_minutes: 15, is_active: true,  effective_from: '2026-06-01', effective_to: '2026-12-31', activity_plans: { name: '標準方案' } },
  { id: 'r4', guide_id: 'g1', activity_plan_id: 'p2', weekday: 6, start_time_local: '10:00', end_time_local: '13:00', slot_interval_minutes: 60, buffer_before_minutes: 15, buffer_after_minutes: 15, is_active: false, effective_from: null, effective_to: null, activity_plans: { name: '標準方案' } },
];

const AVAILABILITY_BLACKOUTS = [
  { id: 'bl1', guide_id: 'g1', starts_at: '2026-06-10T16:00:00Z', ends_at: '2026-06-11T16:00:00Z', reason: '私人行程', source: 'manual' },
];

async function mockApi(page) {
  // Single route, content-based dispatch — Playwright is LIFO so a generic
  // catch-all registered last would shadow every specific route.
  await page.route('**/api/guide/**', (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const ok = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
    if (p === '/api/guide/auth/csrf')                  return ok({});
    if (p === '/api/guide/dashboard')                  return ok(DASHBOARD_DATA);
    if (p.startsWith('/api/guide/qa/pending'))         return ok([]);
    if (p === '/api/guide/schedules')                  return ok(SCHEDULES_DATA);
    if (p === '/api/guide/bookings')                   return ok(BOOKINGS_DATA);
    if (p === '/api/guide/availability-rules')         return ok({ rules: AVAILABILITY_RULES });
    if (p === '/api/guide/blackout-dates')              return ok({ blackouts: AVAILABILITY_BLACKOUTS });
    if (p === '/api/guide/availability-preview')        return ok({ slots: [] });
    if (p === '/api/guide/activities-with-plans')      return ok(AVAILABILITY_PLANS);
    if (p === '/api/guide/profile')                     return ok(PROFILE_DATA);
    return ok(null);
  });
}

const PROFILE_DATA = {
  display_name: '阿明導遊',
  headline: '在地八年的高雄柴山嚮導，帶你看見不一樣的港都',
  bio: '我從 2018 年開始帶旅客探索柴山的秘境洞窟、北投的溫泉小巷、猴硐的貓村故事。我相信好的導遊不只是把你帶到景點，而是讓你聽見地方的聲音。\n\n中文・英文流利、簡單日文溝通沒問題。喜歡攝影、爬山、跟旅客一起喝下午茶。',
  region: '高雄',
  languages: ['中文', '英文', '日文'],
  specialties: ['歷史導覽', '美食探訪', '山林秘境'],
  // Empty image state so screenshots don't depend on an external image host
  // being whitelisted in next.config remotePatterns. The dashed-upload UI
  // is what we want to verify visually anyway.
  profile_photo_url: null,
  hero_image_url: null,
  gallery_urls: [],
  slug: 'andy-ming',
};

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    // Middleware does a lightweight format-only check, so a three-segment
    // guide_token is enough to get past the gate. Real HMAC verification
    // happens in API routes that we already mock.
    await ctx.addCookies([
      // Middleware format check requires signature.length === 64. Use a 64-char
      // hex placeholder — full HMAC verification happens only in API routes,
      // which we mock above.
      { name: 'guide_token', value: 'g1:1:' + 'a'.repeat(64),          domain: 'localhost', path: '/', httpOnly: true },
      { name: 'guide_id',    value: 'g1',                              domain: 'localhost', path: '/' },
      { name: 'guide_name',  value: encodeURIComponent('阿明導遊'),    domain: 'localhost', path: '/' },
    ]);
    const page = await ctx.newPage();
    await mockApi(page);
    for (const p of PAGES) {
      try {
        await page.goto(BASE + p.route, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(600);
      } catch (e) {
        console.error(`nav fail ${p.name}@${vp.name}: ${e.message}`);
      }
      const file = path.join(OUT, `${p.name}--${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true }).catch((e) => console.error(`shot fail ${p.name}@${vp.name}: ${e.message}`));
      console.log(`✓ ${file}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

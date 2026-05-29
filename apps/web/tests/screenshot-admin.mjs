#!/usr/bin/env node
// One-shot Playwright screenshot sweep at mobile (375), tablet (768), desktop (1280).
// Mocks all /api/admin/* responses so we can render the UI without a real DB or auth.
// Renders /admin/login (public) at all widths, and the protected pages at 375 + 1280
// (force-rendered by setting admin cookies and intercepting auth checks).

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '__screenshots__');
await mkdir(OUT, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:3333';

// Fake admin auth cookies — middleware checks presence + format only on the edge,
// real verification happens in /api/admin/auth/session which we mock below.
const ADMIN_TOKEN = process.env.ADMIN_ACCESS_TOKEN || 'localdevadmintoken123';
const ADMIN_EMAIL = 'demo@admin.local';
const SESSION_EXPIRES = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const COOKIES = [
  { name: 'admin_token',                value: ADMIN_TOKEN,       domain: 'localhost', path: '/' },
  { name: 'admin_email',                value: ADMIN_EMAIL,       domain: 'localhost', path: '/' },
  { name: 'admin_session_expires_at',   value: SESSION_EXPIRES,   domain: 'localhost', path: '/' },
  { name: 'admin_session_version',      value: '1',               domain: 'localhost', path: '/' },
  { name: 'tp_csrf',                    value: 'test-csrf',       domain: 'localhost', path: '/' },
];

// ── Fake API payloads ─────────────────────────────────────────────
const NOW = Date.now();
const oid = (i) => `ord_${String(i).padStart(8, '0')}aaaaaa`;

const fakeOrders = Array.from({ length: 8 }, (_, i) => ({
  id: oid(i + 1), status: ['paid','confirmed','refund_pending','pending_payment'][i % 4],
  totalTwd: 2400 + i * 600, costTwd: 1800 + i * 400, marginTwd: 600 + i * 200,
  title: ['柴山祕境洞窟探險','北港溪漂流','旗津港都早安散步','池上稻浪夕陽自行車','蘭嶼夜訪角鴞','澎湖無人島跳島'][i % 6],
  peopleCount: 2, contactName: ['小美','志明','怡君','建宏'][i % 4],
  contactEmail: 'guest@example.com',
  createdAt: new Date(NOW - i * 86400000).toISOString(),
  paidAt: new Date(NOW - i * 86400000 + 3600000).toISOString(),
  adminNote: null, trade_no: null,
}));

const fakeRefunds = Array.from({ length: 5 }, (_, i) => ({
  id: `rf_${String(i + 1).padStart(8, '0')}`,
  orderId: oid(i + 1),
  reason: ['行程取消','個人因素','身體不適','天氣不佳','重複下單'][i],
  note: '客服已聯繫旅客確認',
  status: ['pending','approved','processing','completed','rejected'][i],
  requestedAt: new Date(NOW - i * 86400000).toISOString(),
  orderStatus: 'paid', totalTwd: 2400 + i * 600,
  contactName: ['小美','志明','怡君','建宏','美玲'][i],
  contactEmail: 'guest@example.com',
}));

const fakeKpi = {
  totalOrders: 142, pendingOrders: 8, pendingRefunds: 3, pendingGuideApps: 2,
  totalGmv: 386400, totalCommissionTwd: 57960,
  healthyOrderRate: 92, exceptionRate: 4,
};
const fakeQueues = {
  orders: fakeOrders.slice(0, 3).map(o => ({ id: o.id, status: o.status })),
  refunds: fakeRefunds.slice(0, 3).map(r => ({ orderId: r.orderId, status: r.status })),
  guides: [{ fullName: '陳大文', city: '台北市' }, { fullName: '林小芬', city: '花蓮縣' }],
};
const fakeTrends = Array.from({ length: 7 }, (_, i) => ({
  date: new Date(NOW - (6 - i) * 86400000).toISOString().slice(0, 10),
  orders: 12 + i * 3, refunds: 1 + (i % 3), guides: i % 2,
}));

const fakeActivities = Array.from({ length: 6 }, (_, i) => ({
  id: `act_${i + 1}`, slug: `tour-${i + 1}`,
  title: ['柴山祕境洞窟探險','北港溪漂流','旗津港都早安散步','池上稻浪夕陽自行車','蘭嶼夜訪角鴞','澎湖無人島跳島'][i],
  region: ['高雄','南投','高雄','台東','台東','澎湖'][i],
  category: ['adventure','adventure','culture','outdoor','wildlife','adventure'][i],
  priceTwd: 1200 + i * 300,
  status: ['published','published','draft','published','archived','published'][i],
  guideName: ['阿明','小芬','大文','建宏','怡君','志明'][i],
  scheduleCount: 3 + i,
}));

// ── Route mocking ────────────────────────────────────────────────
// NOTE: Playwright tries routes in REVERSE registration order — last
// registered wins. So we register the fallthrough FIRST, then the
// more-specific mocks, so the specific ones intercept first.
async function mockAdminApi(page) {
  // Fallthrough — register first so specifics override it.
  await page.route('**/api/admin/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200 });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });

  await page.route('**/api/admin/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { authorized: true, email: ADMIN_EMAIL, expiresAt: SESSION_EXPIRES, sessionVersion: 1 } }) }));
  await page.route('**/api/admin/auth/csrf', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { token: 'test-csrf' } }) }));
  await page.route('**/api/admin/dashboard/summary**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { kpi: fakeKpi, queues: fakeQueues, trends: fakeTrends, definitions: { '健康訂單率':'過去 7 日無例外比率' } } }) }));
  await page.route(/\/api\/admin\/orders(\?.*)?$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: fakeOrders }) }));
  await page.route('**/api/admin/refund-requests**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: fakeRefunds }) }));
  await page.route(/\/api\/admin\/activities(\?.*)?$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: fakeActivities }) }));
  await page.route('**/api/admin/guide-applications**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [
        { id: 'app_1', fullName: '陳大文', email: 'chen@ex.com', phone: '0912000111', city: '台北市', status: 'pending', bio: '熟悉北部歷史人文，擅長帶領家庭親子體驗。', createdAt: new Date(NOW - 86400000).toISOString() },
        { id: 'app_2', fullName: '林小芬', email: 'lin@ex.com', phone: '0922000222', city: '花蓮縣', status: 'approved', bio: '太魯閣專屬嚮導，10 年經驗。', createdAt: new Date(NOW - 3 * 86400000).toISOString() },
      ] }) }));
  await page.route('**/api/admin/guides/approved**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [] }) }));
  await page.route('**/api/admin/payouts**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: Array.from({ length: 4 }, (_, i) => ({
        id: `pay_${i + 1}aaaaaaaa`, guide_id: `g${i}`, total_twd: 12000 + i * 4000,
        state: ['pending','paid','pending','cancelled'][i],
        confirmed_by: null, confirmed_at: i === 1 ? new Date(NOW).toISOString() : null,
        transfer_ref: i === 1 ? 'TXN20260528001' : null, notes: null,
        created_at: new Date(NOW - i * 86400000).toISOString(),
        guide_profiles: { display_name: ['阿明導遊','小芬導覽','大文老師','志明哥'][i], email: `g${i}@ex.com` },
      })) }) }));
  await page.route('**/api/admin/operations-tracking/summary', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: {
        totalGmv: 386400, totalCommissionTwd: 57960, avgFinalContributionTwd: 412, healthyOrderRate: 92,
        kpiConfig: { commissionRate: 0.15, paymentFeeRate: 0.035 },
      } }) }));
  await page.route(/\/api\/admin\/operations-tracking$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: fakeOrders.map((o, i) => ({
        orderId: o.id, orderDate: o.createdAt, guideName: ['阿明','小芬'][i % 2],
        activityName: o.title, scheduleDate: o.createdAt, travelers: 2,
        status: o.status, gmv: o.totalTwd,
        commissionTwd: Math.round(o.totalTwd * 0.15), paymentFeeTwd: Math.round(o.totalTwd * 0.035),
        manualMinutes: 10, manualCostTwd: 50, refundAmountTwd: 0, subsidyTwd: 0,
        hasException: i === 2, finalContributionTwd: Math.round(o.totalTwd * 0.15) - Math.round(o.totalTwd * 0.035) - 50,
        isHealthyOrder: i !== 2,
      })) }) }));
}

// ── Targets ──────────────────────────────────────────────────────
const TARGETS = [
  { route: '/admin',                                    name: 'dashboard' },
  { route: '/admin/orders',                             name: 'orders' },
  { route: '/admin/refunds',                            name: 'refunds' },
  { route: '/admin/payouts',                            name: 'payouts' },
  { route: '/admin/activities',                         name: 'activities' },
  { route: '/admin/guides',                             name: 'guides' },
  { route: '/admin/operations-tracking',                name: 'operations-tracking' },
];

const WIDTHS = [
  { name: 'mobile-375',  width: 375,  height: 812 },
  { name: 'desktop-1280', width: 1280, height: 900 },
];

const browser = await chromium.launch();
try {
  for (const w of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: w.width, height: w.height },
      deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });
    await context.addCookies(COOKIES);
    const page = await context.newPage();
    await mockAdminApi(page);

    for (const t of TARGETS) {
      try {
        await page.goto(BASE + t.route, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(600);  // let any client-side render settle
      } catch (e) {
        console.error(`navigation fail ${t.route}@${w.name}: ${e.message}`);
      }
      const file = path.join(OUT, `${t.name}--${w.name}.png`);
      await page.screenshot({ path: file, fullPage: true }).catch((e) => console.error(`screenshot fail ${file}: ${e.message}`));
      console.log(`✓ ${file}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

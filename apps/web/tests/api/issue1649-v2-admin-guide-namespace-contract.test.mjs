/**
 * #1649 Phase 3+4 — admin/guide 訂單金流面 v2 命名空間接線 source-contract 測試。
 *
 * 策略鎖定（單一實作 strangler）：
 * 1. /api/v2/admin/** 與 /api/v2/guide/** 殼 route 存在，且**委派 legacy handler**
 *    （re-export 或 CSRF wrapper + 委派）——零行為漂移；envelope/錯誤碼與 legacy 全等。
 * 2. admin v2 命名空間由 middleware（matcher 含 /api/v2/admin/:path*）施加 auth+CSRF；
 *    guide v2 命名空間 middleware 不涵蓋 → 寫入殼內必須顯式 validateCsrf。
 * 3. admin 四頁＋guide 四頁零 legacy 訂單/金流 endpoint 呼叫。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');

// ── admin/guide v2 routes：Phase 6 後實作本體落地 v2（殼已隨 legacy 退役淘汰） ──

const ADMIN_ROUTES = [
  ['orders', 'GET'],
  ['orders/[orderId]', 'GET', 'PATCH'],
  ['orders/[orderId]/timeline', 'GET'],
  ['orders/[orderId]/audit-logs', 'GET'],
  ['orders/[orderId]/messages', 'GET'],
  ['orders/[orderId]/cancel', 'POST'],
  ['orders/[orderId]/exceptions', 'POST'],
  ['orders/[orderId]/refund-execute', 'POST'],
  ['orders/[orderId]/refund-override', 'POST'],
  ['refund-requests', 'GET'],
  ['refund-requests/csv', 'GET'],
  ['refund-requests/[refundRequestId]/approve', 'POST'],
  ['refund-requests/[refundRequestId]/reject', 'POST'],
  ['refund-requests/[refundRequestId]/process', 'POST'],
  ['refund-requests/[refundRequestId]/complete', 'POST'],
  ['payouts', 'GET'],
  ['payouts/balances', 'GET'],
  ['payouts/generate', 'POST'],
  ['payouts/[payoutId]/confirm', 'POST'],
  ['payouts/[payoutId]/cancel', 'POST'],
];

test('v2 admin routes：全數存在且為實作本體（#1649 Phase 6 搬遷完成）', async () => {
  for (const [rest, ...methods] of ADMIN_ROUTES) {
    const src = await read(`app/api/v2/admin/${rest}/route.ts`);
    for (const m of methods) {
      assert.match(src, new RegExp(`export async function ${m}`), `v2/admin/${rest} 需含 ${m} 實作`);
    }
    assert.ok(!/from '[.\/]+admin\//.test(src), `v2/admin/${rest} 不得再 re-export legacy（已退役）`);
  }
});

test('v2 guide routes：實作本體＋寫入路徑顯式 CSRF', async () => {
  const routes = [
    ['bookings', 'GET'], ['bookings/pending-approval', 'GET'], ['bookings/[bookingId]', 'GET'],
    ['payout/monthly', 'GET'], ['payout/monthly/csv', 'GET'], ['messages', 'GET'],
    ['reschedule-requests', 'GET'],
  ];
  for (const [rest, m] of routes) {
    const src = await read(`app/api/v2/guide/${rest}/route.ts`);
    assert.match(src, new RegExp(`export async function ${m}`), `v2/guide/${rest} 需含 ${m} 實作`);
    assert.match(src, /verifyGuideSession/, `v2/guide/${rest} 需 guide session auth`);
  }
  for (const rest of ['bookings/[bookingId]/approval', 'orders/[orderId]/messages', 'reschedule-requests/[requestId]/decision']) {
    const src = await read(`app/api/v2/guide/${rest}/route.ts`);
    assert.match(src, /validateCsrf\(req\)/, `v2/guide/${rest} 寫入必須顯式 CSRF（middleware 不涵蓋 /api/v2/guide）`);
    assert.match(src, /export async function POST/, `v2/guide/${rest} 需含 POST 實作`);
  }
  // payout 兩支維持 force-dynamic（legacy 行為）
  for (const rest of ['payout/monthly', 'payout/monthly/csv']) {
    const src = await read(`app/api/v2/guide/${rest}/route.ts`);
    assert.match(src, /export const dynamic = 'force-dynamic'/, `v2/guide/${rest} 需維持 force-dynamic`);
  }
});

// ── 前端零 legacy 呼叫 ───────────────────────────────────────────────

test('admin 四頁零 legacy 訂單/退款/payouts endpoint 呼叫', async () => {
  const pages = [
    'app/admin/orders/page.tsx',
    'app/admin/refunds/page.tsx',
    'app/admin/payouts/page.tsx',
    'app/admin/ops/orders/page.tsx',
  ];
  for (const page of pages) {
    const src = await read(page);
    assert.ok(!/\/api\/admin\/(orders|refund-requests|payouts)/.test(src), `${page} 不得再呼叫 legacy admin endpoint`);
    assert.match(src, /\/api\/v2\/admin\//, `${page} 需改走 /api/v2/admin/**`);
  }
});

test('guide 四頁零 legacy 訂單/金流 endpoint 呼叫', async () => {
  const pages = [
    'app/guide/bookings/page.tsx',
    'app/guide/dashboard/page.tsx',
    'app/guide/messages/page.tsx',
    'app/guide/reschedules/page.tsx',
  ];
  for (const page of pages) {
    const src = await read(page);
    assert.ok(
      !/\/api\/guide\/(bookings|payout|messages|orders\/|reschedule-requests)/.test(src),
      `${page} 不得再呼叫 legacy guide 訂單/金流 endpoint`
    );
    assert.match(src, /\/api\/v2\/guide\//, `${page} 需改走 /api/v2/guide/**`);
  }
});

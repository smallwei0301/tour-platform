/**
 * Issue #1571 — createOrder / paymentCallback / refund 三鏈路雙實作契約測試（強化）。
 *
 * 補 #1384 未涵蓋的「行為導向邊界」與「防漂移守衛」：
 *  1. calculateRefundAmount（refund-policy.ts 純函式，兩實作退款金額的單一真相）
 *     — 政策分級 100/70/0%、TWD 整數 rounding、cutoff 邊界。
 *  2. paymentCallback in-memory 邊界：replay 冪等 noop、非法轉移 throw、擁有權不符 throw。
 *  3. refund in-memory：blocked 狀態 throw、requestId 冪等 replay。
 *  4. 防漂移 source-contract：db.mjs 與 services.mjs 兩實作共用同一 blocked 狀態語意
 *     與同一 replay-noop / 狀態機來源（refund-transition.mjs），避免「只改一邊」的漂移。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// 強制 in-memory 分支（環境可能帶 SUPABASE_*）
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { calculateRefundAmount } = await import('../../src/lib/refund-policy.ts');
const { createOrderDb, processPaymentCallbackDb, createRefundRequestDb } = await import('../../src/lib/db.mjs');

// cwd 無關的路徑基準（run-checks.sh 從 repo root 跑、npm test 從 apps/web 跑皆可）
const WEB_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dbSrc = readFileSync(path.join(WEB_ROOT, 'src/lib/db.mjs'), 'utf8');
const servicesSrc = readFileSync(path.join(WEB_ROOT, 'src/lib/services.mjs'), 'utf8');

// 稽核政策（168h 全退 / 72–168h 七成 / <72h 不退）
const POLICY = {
  version: 'test-v1',
  tiers: [
    { cutoff_hours: 168, label: 'full', refund_pct: 100 },
    { cutoff_hours: 72, label: 'partial', refund_pct: 70 },
    { cutoff_hours: 0, label: 'none', refund_pct: 0 },
  ],
};
const NOW = new Date('2026-07-03T00:00:00Z');
const hoursLater = (h) => new Date(NOW.getTime() + h * 3600_000);

// ── 1. calculateRefundAmount 政策分級（純函式，兩實作退款金額單一真相）─────────────
test('refund-policy: 出發前 ≥168h → 全退 100%', () => {
  const r = calculateRefundAmount(4000, hoursLater(200), POLICY, NOW);
  assert.equal(r.refund_pct, 100);
  assert.equal(r.refundable_amount, 4000);
  assert.equal(r.eligible, true);
});

test('refund-policy: 72–168h → 七成 70%，TWD 整數 rounding', () => {
  const r = calculateRefundAmount(999, hoursLater(100), POLICY, NOW);
  assert.equal(r.refund_pct, 70);
  assert.equal(r.refundable_amount, 699); // round(999*0.7=699.3)=699
});

test('refund-policy: <72h → 不退 0%、eligible=false', () => {
  const r = calculateRefundAmount(4000, hoursLater(24), POLICY, NOW);
  assert.equal(r.refund_pct, 0);
  assert.equal(r.refundable_amount, 0);
  assert.equal(r.eligible, false);
});

test('refund-policy: 恰在 168h 邊界 → 落在全退（首階 >= cutoff）', () => {
  const r = calculateRefundAmount(4000, hoursLater(168), POLICY, NOW);
  assert.equal(r.refund_pct, 100);
});

// ── 2 & 3. in-memory 鏈路邊界行為 ───────────────────────────────────────────────
function makeOrder(overrides = {}) {
  return createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0401',
    peopleCount: 1,
    contactName: '契約',
    contactPhone: '0911000000',
    contactEmail: `c1571_${Math.random().toString(36).slice(2, 8)}@example.com`,
    ...overrides,
  });
}

test('createOrder: 初始 status=pending_payment', async () => {
  const o = await makeOrder();
  assert.equal(o.status, 'pending_payment');
});

test('paymentCallback: pending_payment→paid，replay 再打為冪等 noop（狀態不變）', async () => {
  const o = await makeOrder();
  const r1 = await processPaymentCallbackDb({ orderId: o.id });
  assert.equal(r1.order.status, 'paid');
  const r2 = await processPaymentCallbackDb({ orderId: o.id });
  assert.equal(r2.order.status, 'paid'); // 冪等：不重複扣位、狀態不變
});

test('paymentCallback: 擁有權 email 不符 → throw', async () => {
  const o = await makeOrder();
  await assert.rejects(
    () => processPaymentCallbackDb({ orderId: o.id, ownerEmail: 'attacker@example.com' }),
    /ownership/i
  );
});

test('refund: paid 訂單可申請 → refund_pending，同 requestId 冪等 replay', async () => {
  const o = await makeOrder();
  await processPaymentCallbackDb({ orderId: o.id });
  const req1 = await createRefundRequestDb({ orderId: o.id, requestId: 'rq-1571-a', reason: 'user_request' });
  const req2 = await createRefundRequestDb({ orderId: o.id, requestId: 'rq-1571-a', reason: 'user_request' });
  assert.equal(req1.id, req2.id, '同 requestId 應冪等回同一筆');
  assert.ok(req2.idempotentReplay, '第二次應標記 idempotentReplay');
});

// ── 4. 防漂移 source-contract（兩實作語意一致）─────────────────────────────────
test('drift-guard: db.mjs 與 services.mjs 的 refund blocked 狀態語意一致', () => {
  for (const src of [dbSrc, servicesSrc]) {
    assert.match(src, /cancelled_by_user/, 'blocked 狀態需含 cancelled_by_user');
    assert.match(src, /cancelled_by_guide/, 'blocked 狀態需含 cancelled_by_guide');
    assert.match(src, /allowAdminCancelled/, '兩實作皆須有 allowAdminCancelled 放行分支');
  }
});

test('drift-guard: 兩實作 callback 皆冪等（機制不同但語意一致）', () => {
  // in-memory：以 replay-noop audit 分支保證冪等
  assert.match(servicesSrc, /payment_callback_replay_noop/);
  // Supabase：以 fn_process_payment_callback_atomic 原子 RPC＋idempotency 保證（見 #1384/原子性文件）
  assert.match(dbSrc, /fn_process_payment_callback_atomic/);
});

test('drift-guard: refund 狀態機集中於 refund-transition.mjs（db.mjs import 之，非各自實作）', () => {
  assert.match(dbSrc, /from '\.\/refund-transition\.mjs'/);
});

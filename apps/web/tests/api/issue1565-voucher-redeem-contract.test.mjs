/**
 * Issue #1565 — 導遊核銷（confirmed→completed）契約測試。
 * in-memory fallback 行為 ＋ route/領域檔 source-contract（strangler 硬規則）。
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const { evaluateRedeemEligibility } = await import('../../src/lib/redeem-eligibility.mjs');
const { redeemVoucherDb } = await import('../../src/lib/db-redeem.mjs');
const { orders, auditLogs } = await import('../../src/lib/store.mjs');

function seed(overrides = {}) {
  const o = {
    id: `ord_1565_${Math.random().toString(36).slice(2, 8)}`,
    status: 'confirmed',
    guideId: 'guide-A',
    scheduleStartAt: '2026-08-01T00:00:00Z',
    contactEmail: 'v1565@example.com',
    ...overrides,
  };
  orders.push(o);
  return o;
}

describe('evaluateRedeemEligibility（純函式）', () => {
  it('confirmed＋同導遊 → eligible', () => {
    assert.deepEqual(
      evaluateRedeemEligibility({ status: 'confirmed', orderGuideId: 'g1', requestingGuideId: 'g1' }),
      { ok: true, alreadyRedeemed: false, reason: 'eligible' }
    );
  });
  it('不同導遊 → not_owner', () => {
    assert.equal(evaluateRedeemEligibility({ status: 'confirmed', orderGuideId: 'g1', requestingGuideId: 'g2' }).reason, 'not_owner');
  });
  it('completed → alreadyRedeemed（冪等，非錯誤）', () => {
    const r = evaluateRedeemEligibility({ status: 'completed', orderGuideId: 'g1', requestingGuideId: 'g1' });
    assert.equal(r.ok, false);
    assert.equal(r.alreadyRedeemed, true);
  });
  it('pending_payment/paid/cancelled → not_confirmed', () => {
    for (const s of ['pending_payment', 'paid', 'cancelled_by_user']) {
      assert.equal(evaluateRedeemEligibility({ status: s, orderGuideId: 'g1', requestingGuideId: 'g1' }).reason, 'not_confirmed');
    }
  });
});

describe('redeemVoucherDb（in-memory fallback）', () => {
  beforeEach(() => {
    for (let i = orders.length - 1; i >= 0; i--) if (String(orders[i].id).startsWith('ord_1565_')) orders.splice(i, 1);
  });

  it('confirmed → completed，寫 audit order_voucher_redeemed', async () => {
    const o = seed();
    const r = await redeemVoucherDb({ orderId: o.id, guideId: 'guide-A' });
    assert.equal(r.redeemed, true);
    assert.equal(o.status, 'completed');
    assert.ok(auditLogs.some((l) => l.orderId === o.id && l.action === 'order_voucher_redeemed'));
  });

  it('冪等：重掃 → alreadyRedeemed、不重複 audit', async () => {
    const o = seed();
    await redeemVoucherDb({ orderId: o.id, guideId: 'guide-A' });
    const cnt1 = auditLogs.filter((l) => l.orderId === o.id && l.action === 'order_voucher_redeemed').length;
    const r2 = await redeemVoucherDb({ orderId: o.id, guideId: 'guide-A' });
    const cnt2 = auditLogs.filter((l) => l.orderId === o.id && l.action === 'order_voucher_redeemed').length;
    assert.equal(r2.alreadyRedeemed, true);
    assert.equal(cnt2, cnt1, '重掃不得追加 audit');
  });

  it('非該訂單導遊 → not_owner、狀態不變', async () => {
    const o = seed({ guideId: 'guide-A' });
    const r = await redeemVoucherDb({ orderId: o.id, guideId: 'guide-B' });
    assert.equal(r.reason, 'not_owner');
    assert.equal(o.status, 'confirmed');
  });

  it('回傳 shape：{ redeemed, alreadyRedeemed, status, reason }', async () => {
    const o = seed();
    const r = await redeemVoucherDb({ orderId: o.id, guideId: 'guide-A' });
    for (const k of ['redeemed', 'alreadyRedeemed', 'status', 'reason']) assert.ok(k in r);
  });
});

describe('source contract — route＋strangler', () => {
  const routeSrc = fs.readFileSync(path.join(ROOT, 'app/api/v2/guide/orders/[orderId]/redeem/route.ts'), 'utf8');
  const dbSrc = fs.readFileSync(path.join(ROOT, 'src/lib/db.mjs'), 'utf8');

  it('route 驗 CSRF＋guide session＋voucher token（綁定同一 orderId）', () => {
    assert.match(routeSrc, /validateCsrf/);
    assert.match(routeSrc, /verifyGuideSession/);
    assert.match(routeSrc, /verifyVoucherToken/);
    assert.match(routeSrc, /tokenOrderId\s*!==\s*orderId/);
  });
  it('核銷邏輯走 db-redeem 領域檔，不進 db.mjs（strangler 硬規則）', () => {
    assert.match(routeSrc, /from '.*db-redeem\.mjs'/);
    assert.ok(!/redeemVoucher/.test(dbSrc), '核銷邏輯不得寫進 db.mjs 單體');
  });
});

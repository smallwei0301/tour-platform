/**
 * 部分退款（partial refund）— refund-execute 金額解析與三條執行路徑。
 *
 * 需求：後台「執行退款」可手動填入部分金額，ECPay 訂單會以該金額實際向 ECPay
 * 送出退刷（DoAction TotalAmount），現金訂單記錄為實退金額；留空＝全額（向後相容）。
 *
 * Run: node --test apps/web/tests/api/partial-refund-amount.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRefundAmount,
  executeRefund,
  executeEcpayReversal,
} from '../../src/lib/refund-execute.ts';

// ── resolveRefundAmount（純函式） ─────────────────────────────────────────────

test('resolveRefundAmount: 留空/null/空字串 → 全額、partial=false', () => {
  for (const empty of [undefined, null, '']) {
    const r = resolveRefundAmount(empty, 1500);
    assert.deepEqual(r, { amount: 1500, partial: false });
  }
});

test('resolveRefundAmount: 合法部分金額 → partial=true', () => {
  assert.deepEqual(resolveRefundAmount(500, 1500), { amount: 500, partial: true });
  assert.deepEqual(resolveRefundAmount('500', 1500), { amount: 500, partial: true });
});

test('resolveRefundAmount: 等於全額 → partial=false', () => {
  assert.deepEqual(resolveRefundAmount(1500, 1500), { amount: 1500, partial: false });
});

test('resolveRefundAmount: 0 / 負數 / 非整數 → INVALID_REFUND_AMOUNT', () => {
  for (const bad of [0, -100, 12.5, 'abc']) {
    const r = resolveRefundAmount(bad, 1500);
    assert.ok('error' in r, `expected error for ${bad}`);
    assert.equal(r.error.code, 'INVALID_REFUND_AMOUNT');
  }
});

test('resolveRefundAmount: 超過訂單總額 → REFUND_AMOUNT_EXCEEDS_TOTAL', () => {
  const r = resolveRefundAmount(2000, 1500);
  assert.ok('error' in r);
  assert.equal(r.error.code, 'REFUND_AMOUNT_EXCEEDS_TOTAL');
});

// ── executeRefund：現金訂單 ───────────────────────────────────────────────────

test('executeRefund 現金：部分金額寫入 refunded_amount，body 標記 partial', async () => {
  const captured = { payload: null };
  const outcome = await executeRefund({
    order: { id: 'cash-1', status: 'refund_pending', total_twd: 1500 },
    body: { reason: '部分退款測試' },
    refundAmount: 500,
    requestAllRefund: async () => { throw new Error('should not call ECPay for cash'); },
    updateOrder: async (_id, payload) => { captured.payload = payload; return { error: null, data: [{ id: 'cash-1' }], count: 1 }; },
  });

  assert.equal(outcome.status, 200);
  assert.equal(captured.payload.refunded_amount, 500);
  assert.equal(outcome.body.data.partial, true);
  assert.equal(outcome.body.data.refundedAmount, 500);
});

test('executeRefund 現金：留空 → 全額退款（向後相容）', async () => {
  const captured = { payload: null };
  const outcome = await executeRefund({
    order: { id: 'cash-2', status: 'refund_pending', total_twd: 900 },
    body: { reason: '全額' },
    requestAllRefund: async () => { throw new Error('should not call'); },
    updateOrder: async (_id, payload) => { captured.payload = payload; return { error: null, data: [{ id: 'cash-2' }], count: 1 }; },
  });

  assert.equal(outcome.status, 200);
  assert.equal(captured.payload.refunded_amount, 900);
  assert.equal(outcome.body.data.partial, false);
});

test('executeRefund：非法金額 → 400 INVALID_REFUND_AMOUNT（不打 ECPay/DB）', async () => {
  let updated = false;
  const outcome = await executeRefund({
    order: { id: 'cash-3', status: 'refund_pending', total_twd: 900 },
    body: { reason: 'x' },
    refundAmount: -5,
    requestAllRefund: async () => { throw new Error('should not call'); },
    updateOrder: async () => { updated = true; return { error: null }; },
  });

  assert.equal(outcome.status, 400);
  assert.equal(outcome.body.error.code, 'INVALID_REFUND_AMOUNT');
  assert.equal(updated, false);
});

test('executeRefund：金額超過總額 → 400 REFUND_AMOUNT_EXCEEDS_TOTAL', async () => {
  const outcome = await executeRefund({
    order: { id: 'cash-4', status: 'refund_pending', total_twd: 900 },
    body: { reason: 'x' },
    refundAmount: 1000,
    requestAllRefund: async () => { throw new Error('should not call'); },
    updateOrder: async () => ({ error: null }),
  });

  assert.equal(outcome.status, 400);
  assert.equal(outcome.body.error.code, 'REFUND_AMOUNT_EXCEEDS_TOTAL');
});

// ── executeRefund：ECPay AllRefund ────────────────────────────────────────────

test('executeRefund ECPay：部分金額傳給 requestAllRefund(totalAmount) 且寫入 refunded_amount', async () => {
  const ecpay = { totalAmount: null };
  const captured = { payload: null };
  const outcome = await executeRefund({
    order: { id: 'ec-1', status: 'refund_pending', total_twd: 1500, trade_no: 'TN-1', merchant_trade_no: 'MTN-1' },
    body: {},
    refundAmount: 600,
    requestAllRefund: async (p) => { ecpay.totalAmount = p.totalAmount; return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'RF-1' }; },
    updateOrder: async (_id, payload) => { captured.payload = payload; return { error: null, data: [{ id: 'ec-1' }], count: 1 }; },
  });

  assert.equal(outcome.status, 200);
  assert.equal(ecpay.totalAmount, 600, 'ECPay 退刷金額應為部分金額');
  assert.equal(captured.payload.refunded_amount, 600);
  assert.equal(outcome.body.data.partial, true);
  assert.equal(outcome.body.data.refundedAmount, 600);
});

test('executeRefund ECPay：留空 → 全額傳給 ECPay（向後相容）', async () => {
  const ecpay = { totalAmount: null };
  const outcome = await executeRefund({
    order: { id: 'ec-2', status: 'refund_pending', total_twd: 1500, trade_no: 'TN-2', merchant_trade_no: 'MTN-2' },
    body: {},
    requestAllRefund: async (p) => { ecpay.totalAmount = p.totalAmount; return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'RF-2' }; },
    updateOrder: async () => ({ error: null, data: [{ id: 'ec-2' }], count: 1 }),
  });

  assert.equal(outcome.status, 200);
  assert.equal(ecpay.totalAmount, 1500);
});

// ── executeEcpayReversal：DoAction R（已請款信用卡可部分退） ───────────────────

function reversiblePayment() {
  return { id: 'pay-r', order_id: 'ec-r', merchant_trade_no: 'MTN-R', trade_no: 'TN-R', status: 'paid', provider_status: '1', amount_twd: 1200 };
}

test('executeEcpayReversal Action=R：部分金額傳給 DoAction(totalAmount) 且 persist refundedAmountTwd', async () => {
  const doAction = { totalAmount: null, action: null };
  const persisted = { refundedAmountTwd: undefined };
  const outcome = await executeEcpayReversal({
    order: { id: 'ec-r', total_twd: 1200, trade_no: 'TN-R', merchant_trade_no: 'MTN-R' },
    body: {},
    refundAmount: 400,
    resolveLatestReversiblePayment: async () => ({ payment: reversiblePayment(), ambiguous: false }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '1', tradeNo: 'TN-R', raw: { PaymentType: 'Credit_CreditCard', CaptureAMT: '1200' } }),
    requestDoAction: async (p) => { doAction.totalAmount = p.totalAmount; doAction.action = p.action; return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'EC-R-1' }; },
    persistReversal: async (args) => { persisted.refundedAmountTwd = args.refundedAmountTwd; return { error: null, data: [{ id: 'ec-r' }], count: 1 }; },
    recordIncident: () => {},
  });

  assert.equal(outcome.status, 200);
  assert.equal(doAction.action, 'R');
  assert.equal(doAction.totalAmount, 400, 'DoAction 退刷金額應為部分金額');
  assert.equal(persisted.refundedAmountTwd, 400);
  assert.equal(outcome.body.data.partial, true);
  assert.equal(outcome.body.data.refundedAmount, 400);
});

// ── executeEcpayReversal：Action=N（授權未請款）不可部分退 ─────────────────────

function uncapturedPayment() {
  return { id: 'pay-n', order_id: 'ec-n', merchant_trade_no: 'MTN-N', trade_no: 'TN-N', status: 'authorized', provider_status: '0', amount_twd: 1200 };
}

test('executeEcpayReversal Action=N + 部分金額 → 409 PARTIAL_REFUND_UNSUPPORTED（不打 ECPay）', async () => {
  let doActionCalled = false;
  const outcome = await executeEcpayReversal({
    order: { id: 'ec-n', total_twd: 1200, trade_no: 'TN-N', merchant_trade_no: 'MTN-N' },
    body: {},
    refundAmount: 400,
    resolveLatestReversiblePayment: async () => ({ payment: uncapturedPayment(), ambiguous: false }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '0', tradeNo: 'TN-N', raw: { PaymentType: 'Credit_CreditCard' } }),
    requestDoAction: async () => { doActionCalled = true; return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'EC-N-1' }; },
    persistReversal: async () => ({ error: null, data: [{ id: 'ec-n' }], count: 1 }),
    recordIncident: () => {},
  });

  assert.equal(outcome.status, 409);
  assert.equal(outcome.body.error.code, 'PARTIAL_REFUND_UNSUPPORTED');
  assert.equal(doActionCalled, false, '部分授權撤銷不可能，不應呼叫 ECPay');
});

test('executeEcpayReversal Action=N + 留空（全額）→ 仍正常全額取消授權', async () => {
  const doAction = { action: null };
  const outcome = await executeEcpayReversal({
    order: { id: 'ec-n2', total_twd: 1200, trade_no: 'TN-N2', merchant_trade_no: 'MTN-N2' },
    body: {},
    resolveLatestReversiblePayment: async () => ({ payment: { ...uncapturedPayment(), id: 'pay-n2', order_id: 'ec-n2' }, ambiguous: false }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '0', tradeNo: 'TN-N2', raw: { PaymentType: 'Credit_CreditCard' } }),
    requestDoAction: async (p) => { doAction.action = p.action; return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'EC-N2-1' }; },
    persistReversal: async (args) => { assert.equal(args.refundedAmountTwd, null, 'void 不記退款金額'); return { error: null, data: [{ id: 'ec-n2' }], count: 1 }; },
    recordIncident: () => {},
  });

  assert.equal(outcome.status, 200);
  assert.equal(doAction.action, 'N');
  assert.equal(outcome.body.data.mode, 'authorization_voided');
});

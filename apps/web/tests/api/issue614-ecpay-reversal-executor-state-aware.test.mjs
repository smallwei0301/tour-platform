import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeEcpayReversal } from '../../src/lib/refund-execute.ts';

function baseOrder() {
  return {
    id: 'order-614',
    total_twd: 1200,
    trade_no: 'TN-614',
    merchant_trade_no: 'MTN-614',
  };
}

function basePayment() {
  return {
    id: 'pay-614',
    order_id: 'order-614',
    merchant_trade_no: 'MTN-614',
    trade_no: 'TN-614',
    status: 'authorized',
    provider_status: '0',
    amount_twd: 1200,
  };
}

test('authorized-not-captured state uses void (Action=N), not refund', async () => {
  const calls = [];
  const outcome = await executeEcpayReversal({
    order: baseOrder(),
    body: { reason: 'customer requested cancel' },
    resolveLatestReversiblePayment: async () => ({ payment: basePayment(), ambiguous: false }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '0', tradeNo: 'TN-614', raw: { PaymentType: 'Credit_CreditCard' } }),
    requestDoAction: async (params) => {
      calls.push(params);
      return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'EC-VOID-1' };
    },
    persistReversal: async (args) => {
      calls.push(args);
      return { error: null, data: [{ id: args.orderId }], count: 1 };
    },
  });

  assert.equal(outcome.status, 200);
  assert.equal(calls[0].action, 'N');
  assert.equal(calls[1].eventType, 'authorization_voided');
});

test('missing/zero trade_no on order still takes ECPay reversal path when reversible payment exists', async () => {
  let queriedMerchantNo = null;
  let requestedAction = null;

  const outcome = await executeEcpayReversal({
    order: { ...baseOrder(), trade_no: null },
    body: { reason: 'route consistency' },
    resolveLatestReversiblePayment: async () => ({
      payment: { ...basePayment(), provider_status: '1', status: 'paid' },
      ambiguous: false,
    }),
    queryTradeInfo: async (merchantTradeNo) => {
      queriedMerchantNo = merchantTradeNo;
      return {
        ok: true,
        rtnCode: '1',
        rtnMsg: 'ok',
        tradeStatus: '1',
        tradeNo: 'TN-614',
        raw: { PaymentType: 'Credit_CreditCard' },
      };
    },
    requestDoAction: async (params) => {
      requestedAction = params.action;
      return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'EC-REFUND-ORDER-TRADE-MISSING' };
    },
    persistReversal: async () => ({
      error: null,
      data: [{ id: 'order-614' }],
      count: 1,
    }),
  });

  assert.equal(outcome.status, 200);
  assert.equal(queriedMerchantNo, 'MTN-614');
  assert.equal(requestedAction, 'R');
});

test('executeEcpayReversal persists payment_events using payment row merchant_trade_no', async () => {
  let persistedMerchantNo = undefined;

  const outcome = await executeEcpayReversal({
    order: { ...baseOrder(), trade_no: null },
    body: {},
    resolveLatestReversiblePayment: async () => ({
      payment: { ...basePayment(), merchant_trade_no: 'MTN-REPLACEMENT', status: 'authorized', provider_status: '0' },
      ambiguous: false,
    }),
    queryTradeInfo: async () => ({
      ok: true,
      rtnCode: '1',
      rtnMsg: 'ok',
      tradeStatus: '0',
      tradeNo: 'TN-614',
      raw: { PaymentType: 'Credit_CreditCard' },
    }),
    requestDoAction: async () => ({
      ok: true,
      rtnCode: '1',
      rtnMsg: 'ok',
      ecpayTradeNo: 'EC-VOID-ORDER-TRADE-MISSING',
    }),
    persistReversal: async ({ paymentMerchantTradeNo }) => {
      persistedMerchantNo = paymentMerchantTradeNo;
      return {
        error: null,
        data: [{ id: 'order-614' }],
        count: 1,
      };
    },
    recordIncident: () => {},
  });

  assert.equal(outcome.status, 200);
  assert.equal(persistedMerchantNo, 'MTN-REPLACEMENT');
});

test('unknown provider state blocks and never calls provider reversal API', async () => {
  let called = 0;
  const outcome = await executeEcpayReversal({
    order: baseOrder(),
    body: {},
    resolveLatestReversiblePayment: async () => ({ payment: basePayment(), ambiguous: false }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '9', tradeNo: 'TN-614', raw: { PaymentType: 'Credit_CreditCard' } }),
    requestDoAction: async () => {
      called += 1;
      return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'should-not-run' };
    },
    persistReversal: async () => ({ error: null, data: [{ id: 'order-614' }], count: 1 }),
  });

  assert.equal(outcome.status, 409);
  assert.equal(called, 0);
  assert.equal(outcome.body.error.code, 'ECPAY_STATE_UNKNOWN');
});

test('missing or ambiguous latest reversible payment blocks before provider API', async () => {
  let called = 0;
  const missing = await executeEcpayReversal({
    order: baseOrder(),
    body: {},
    resolveLatestReversiblePayment: async () => ({ payment: null, ambiguous: false }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '1', tradeNo: 'TN-614', raw: {} }),
    requestDoAction: async () => {
      called += 1;
      return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'x' };
    },
    persistReversal: async () => ({ error: null, data: [{ id: 'order-614' }], count: 1 }),
  });

  const ambiguous = await executeEcpayReversal({
    order: baseOrder(),
    body: {},
    resolveLatestReversiblePayment: async () => ({ payment: null, ambiguous: true }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '1', tradeNo: 'TN-614', raw: {} }),
    requestDoAction: async () => {
      called += 1;
      return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'x' };
    },
    persistReversal: async () => ({ error: null, data: [{ id: 'order-614' }], count: 1 }),
  });

  assert.equal(missing.status, 409);
  assert.equal(ambiguous.status, 409);
  assert.equal(called, 0);
});

test('provider failure returns sanitized error and records incident path', async () => {
  let incident = 0;
  const outcome = await executeEcpayReversal({
    order: baseOrder(),
    body: {},
    resolveLatestReversiblePayment: async () => ({ payment: basePayment(), ambiguous: false }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '1', tradeNo: 'TN-614', raw: { PaymentType: 'Credit_CreditCard' } }),
    requestDoAction: async () => ({ ok: false, rtnCode: '102', rtnMsg: 'raw provider details', ecpayTradeNo: null }),
    persistReversal: async () => ({ error: null, data: [{ id: 'order-614' }], count: 1 }),
    recordIncident: () => { incident += 1; },
  });

  assert.equal(outcome.status, 502);
  assert.equal(outcome.body.error.code, 'ECPAY_REVERSAL_FAILED');
  assert.equal(incident, 1);
});

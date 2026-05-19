import test from 'node:test';
import assert from 'node:assert/strict';

const baseOrder = {
  id: 'order-614',
  total_twd: 1200,
  trade_no: 'trade-order-614',
  merchant_trade_no: 'mt-order-614',
  ecpay_refund_trade_no: null,
};

const basePayment = {
  id: 'pay-614',
  order_id: 'order-614',
  merchant_trade_no: 'mt-order-614',
  trade_no: 'trade-614',
  status: 'authorized',
  provider_status: '1',
  amount_twd: 1200,
};

function okPersist() {
  return { error: null, data: [{ id: 'order-614' }], count: 1 };
}

test('issue611 regression: TradeStatus=1 + credit authorized-only evidence must not use Action=R', async () => {
  const { executeEcpayReversal } = await import('../../src/lib/refund-execute.ts');

  const actions = [];
  const incidents = [];

  const outcome = await executeEcpayReversal({
    order: baseOrder,
    body: { reason: 'customer cancel' },
    resolveLatestReversiblePayment: async () => ({ payment: basePayment, ambiguous: false }),
    queryTradeInfo: async () => ({
      ok: true,
      rtnCode: '1',
      rtnMsg: 'ok',
      tradeStatus: '1',
      tradeNo: 'trade-614',
      raw: {
        TradeStatus: '1',
        PaymentType: 'Credit_CreditCard',
        AuthCode: '123456',
        TradeAmt: '30',
        CaptureAMT: '0',
        CloseAMT: '0',
      },
    }),
    requestDoAction: async (params) => {
      actions.push(params.action);
      return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'ecpay-void-614' };
    },
    persistReversal: async () => okPersist(),
    recordIncident: (incident) => incidents.push(incident),
  });

  assert.equal(outcome.status, 200);
  assert.deepEqual(actions, ['N']);
  assert.equal(incidents.length, 0);
});

test('captured/settled credit evidence should use Action=R', async () => {
  const { executeEcpayReversal } = await import('../../src/lib/refund-execute.ts');

  const actions = [];

  const outcome = await executeEcpayReversal({
    order: baseOrder,
    body: { reason: 'customer cancel' },
    resolveLatestReversiblePayment: async () => ({ payment: basePayment, ambiguous: false }),
    queryTradeInfo: async () => ({
      ok: true,
      rtnCode: '1',
      rtnMsg: 'ok',
      tradeStatus: '1',
      tradeNo: 'trade-614',
      raw: {
        TradeStatus: '1',
        PaymentType: 'Credit_CreditCard',
        CaptureAMT: '1200',
      },
    }),
    requestDoAction: async (params) => {
      actions.push(params.action);
      return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'ecpay-refund-614' };
    },
    persistReversal: async () => okPersist(),
  });

  assert.equal(outcome.status, 200);
  assert.deepEqual(actions, ['R']);
});

test('TradeStatus=1 credit without capture-or-auth evidence should block with ECPAY_STATE_UNKNOWN and no provider action', async () => {
  const { executeEcpayReversal } = await import('../../src/lib/refund-execute.ts');

  let called = false;
  const incidents = [];

  const outcome = await executeEcpayReversal({
    order: baseOrder,
    body: { reason: 'state unknown' },
    resolveLatestReversiblePayment: async () => ({ payment: basePayment, ambiguous: false }),
    queryTradeInfo: async () => ({
      ok: true,
      rtnCode: '1',
      rtnMsg: 'ok',
      tradeStatus: '1',
      tradeNo: 'trade-614',
      raw: {
        TradeStatus: '1',
        PaymentType: 'Credit_CreditCard',
      },
    }),
    requestDoAction: async () => {
      called = true;
      return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'never' };
    },
    persistReversal: async () => okPersist(),
    recordIncident: (incident) => incidents.push(incident),
  });

  assert.equal(outcome.status, 409);
  assert.equal(outcome.body?.error?.code, 'ECPAY_STATE_UNKNOWN');
  assert.equal(called, false);
  assert.equal(incidents.length, 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeEcpayReversal } from '../../src/lib/refund-execute.ts';
import { recordRefundReversalDb } from '../../src/lib/db.mjs';

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

function createMockSupabase(steps) {
  const calls = [];
  let cursor = 0;

  const next = (expectedTable) => {
    const step = steps[cursor++];
    if (!step) {
      throw new Error(`Unexpected Supabase call for ${expectedTable}`);
    }
    if (step.table && step.table !== expectedTable) {
      throw new Error(`Expected table ${step.table} but got ${expectedTable}`);
    }
    return step;
  };

  const makeChain = (table) => {
    let pendingUpsert = null;

    const chain = {
      select: () => {
        calls.push({ table, action: 'select' });
        return chain;
      },
      eq: () => {
        calls.push({ table, action: 'eq' });
        return chain;
      },
      maybeSingle: () => {
        calls.push({ table, action: 'maybeSingle' });

        if (pendingUpsert && pendingUpsert.op === 'upsert') {
          const result = pendingUpsert.result;
          pendingUpsert = null;
          return {
            data: result.data ?? null,
            error: result.error ?? null,
            count: result.count,
          };
        }

        const step = next(table);
        return {
          data: step.data ?? null,
          error: step.error ?? null,
          count: step.count,
        };
      },
      upsert: () => {
        const step = next(table);
        calls.push({
          table,
          action: 'upsert',
          payload: step.payload,
          options: step.options,
        });

        if (step.direct === false) {
          pendingUpsert = {
            op: 'upsert',
            result: step.result ?? { data: null, error: null },
          };
          return chain;
        }

        return {
          data: step.data ?? null,
          error: step.error ?? null,
          count: step.count,
        };
      },
      insert: () => {
        const step = next(table);
        calls.push({ table, action: 'insert', payload: step.payload });
        return {
          data: step.data ?? null,
          error: step.error ?? null,
          count: step.count,
        };
      },
    };

    return chain;
  };

  return {
    calls,
    from: (table) => {
      calls.push({ table, action: 'from' });
      return makeChain(table);
    },
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
        raw: { PaymentType: 'Credit_CreditCard', CaptureAMT: '1200' },
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

test('executeEcpayReversal returns DB_UPDATE_FAILED when payments update fails', async () => {
  const outcome = await executeEcpayReversal({
    order: baseOrder(),
    body: { reason: 'rollback safety' },
    resolveLatestReversiblePayment: async () => ({ payment: basePayment(), ambiguous: false }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '0', tradeNo: 'TN-614', raw: { PaymentType: 'Credit_CreditCard' } }),
    requestDoAction: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'EC-VOID-1' }),
    persistReversal: async () => ({
      error: { message: 'failed to update payment' },
      data: [],
      count: 0,
    }),
    recordIncident: () => {},
  });

  assert.equal(outcome.status, 500);
  assert.equal(outcome.body.error.code, 'DB_UPDATE_FAILED');
  assert.match(outcome.body.error.message, /failed to persist refund result: failed to update payment/);
});

test('executeEcpayReversal blocks when TradeStatus=1 lacks capture evidence and no provider action', async () => {
  let called = 0;
  const outcome = await executeEcpayReversal({
    order: baseOrder(),
    body: {},
    resolveLatestReversiblePayment: async () => ({ payment: basePayment(), ambiguous: false }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '1', tradeNo: 'TN-614', raw: { PaymentType: 'Credit_CreditCard' } }),
    requestDoAction: async () => {
      called += 1;
      return { ok: true, rtnCode: '1', rtnMsg: 'ok', ecpayTradeNo: 'EC-REFUND-1' };
    },
    persistReversal: async () => ({
      error: null,
      data: [],
      count: 0,
    }),
    recordIncident: () => {},
  });

  assert.equal(outcome.status, 409);
  assert.equal(outcome.body.error.code, 'ECPAY_STATE_UNKNOWN');
  assert.equal(called, 0);
});

test('executeEcpayReversal returns DB_UPDATE_FAILED when payment_events insert fails', async () => {
  const outcome = await executeEcpayReversal({
    order: baseOrder(),
    body: { reason: 'audit safety' },
    resolveLatestReversiblePayment: async () => ({ payment: basePayment(), ambiguous: false }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '0', tradeNo: 'TN-614', raw: { PaymentType: 'Credit_CreditCard' } }),
    requestDoAction: async () => ({
      ok: true,
      rtnCode: '1',
      rtnMsg: 'ok',
      ecpayTradeNo: 'EC-VOID-1',
    }),
    persistReversal: async () => ({
      error: { message: 'failed to insert payment event' },
      data: [{ id: 'order-614' }],
      count: 1,
    }),
    recordIncident: () => {},
  });

  assert.equal(outcome.status, 500);
  assert.equal(outcome.body.error.code, 'DB_UPDATE_FAILED');
  assert.match(outcome.body.error.message, /failed to persist refund result: failed to insert payment event/);
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
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '1', tradeNo: 'TN-614', raw: { PaymentType: 'Credit_CreditCard', CaptureAMT: '1200' } }),
    requestDoAction: async () => ({ ok: false, rtnCode: '102', rtnMsg: 'raw provider details', ecpayTradeNo: null }),
    persistReversal: async () => ({ error: null, data: [{ id: 'order-614' }], count: 1 }),
    recordIncident: () => {
      incident += 1;
    },
  });

  assert.equal(outcome.status, 502);
  assert.equal(outcome.body.error.code, 'ECPAY_REVERSAL_FAILED');
  assert.equal(incident, 1);
});

// ── #1777 F4（2026-08-04）：以下原本有 9 個 recordRefundReversalDb 的行為測試 ──
//
// 它們測的是舊實作為了「補救非原子」而長出來的補償機制：
//   - status='started' 的 audit marker（先寫 marker 再扣款，讓重試不重複扣）
//   - marker 與現值不一致時的三分支修復（markerBefore／markerAfter／markerDebit）
//   - 「已扣款但 payout_reversal_created 寫失敗」的補寫路徑
//
// 那整套機制的存在理由，就是 reversal 分錄、餘額扣減、audit 三者不在同一個交易裡。
// 現在它們在同一個 plpgsql 交易內同成同敗（fn_record_refund_reversal_atomic），
// **「做到一半」的狀態不可能存在**，補償機制連同舊實作一併刪除。
//
// 這些測試因此不是「還沒改好」，而是在測一段已經不存在的程式碼。留著它們反而會
// 把補償機制鎖成契約，擋住正確的修法（#1777 已經踩過一次：契約測試斷言了壞形式
// 的 ON CONFLICT，等於把 P0 鎖住）。
//
// 替代覆蓋：
//   - 回傳契約與錯誤傳遞：tests/api/issue1777-atomic-refund-reversal.test.mjs
//   - 「只有真正插入新分錄才動餘額」「餘額為 SQL 層增減而非絕對值覆寫」「單一交易」：
//     tests/api/issue1777-migration-contract.test.mjs（鎖 SQL 本身）
//   - 端到端：production 實跑驗證（見 worklog）
//
// 本檔其餘部分（executeEcpayReversal 的 provider 狀態機測試）不受影響。

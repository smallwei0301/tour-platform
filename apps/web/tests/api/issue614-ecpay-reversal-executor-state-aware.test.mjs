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

test('executeEcpayReversal returns DB_UPDATE_FAILED when orders update touches no rows', async () => {
  const outcome = await executeEcpayReversal({
    order: baseOrder(),
    body: {},
    resolveLatestReversiblePayment: async () => ({ payment: basePayment(), ambiguous: false }),
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '1', tradeNo: 'TN-614', raw: { PaymentType: 'Credit_CreditCard' } }),
    requestDoAction: async () => ({
      ok: true,
      rtnCode: '1',
      rtnMsg: 'ok',
      ecpayTradeNo: 'EC-REFUND-1',
    }),
    persistReversal: async () => ({
      error: null,
      data: [],
      count: 0,
    }),
    recordIncident: () => {},
  });

  assert.equal(outcome.status, 500);
  assert.equal(outcome.body.error.code, 'DB_UPDATE_FAILED');
  assert.equal(outcome.body.error.message, 'failed to persist refund result: no rows updated');
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
    queryTradeInfo: async () => ({ ok: true, rtnCode: '1', rtnMsg: 'ok', tradeStatus: '1', tradeNo: 'TN-614', raw: { PaymentType: 'Credit_CreditCard' } }),
    requestDoAction: async () => ({ ok: false, rtnCode: '102', rtnMsg: 'raw provider details', ecpayTradeNo: null }),
    persistReversal: async () => ({ error: null, data: [{ id: 'order-614' }], count: 1 }),
    recordIncident: () => { incident += 1; },
  });

  assert.equal(outcome.status, 502);
  assert.equal(outcome.body.error.code, 'ECPAY_REVERSAL_FAILED');
  assert.equal(incident, 1);
});

test('recordRefundReversalDb returns pre_settlement when no settlement row exists', async () => {
  const supabase = createMockSupabase([
    {
      table: 'payout_items',
      data: null,
      error: null,
    },
  ]);

  const result = await recordRefundReversalDb(supabase, { orderId: 'order-614', actor: 'system' });

  assert.deepEqual(result, { skipped: 'pre_settlement' });
  assert.equal(supabase.calls.length, 5);
  assert.equal(supabase.calls[0].action, 'from');
  assert.equal(supabase.calls[1].action, 'select');
  assert.equal(supabase.calls[2].action, 'eq');
  assert.equal(supabase.calls[3].action, 'eq');
});

test('recordRefundReversalDb throws when settlement lookup fails', async () => {
  const supabase = createMockSupabase([
    {
      table: 'payout_items',
      data: null,
      error: { message: 'lookup failed' },
    },
  ]);

  await assert.rejects(
    () => recordRefundReversalDb(supabase, { orderId: 'order-614' }),
    /lookup failed/
  );
});

test('recordRefundReversalDb throws when guide_balances upsert fails', async () => {
  const supabase = createMockSupabase([
    {
      table: 'payout_items',
      data: {
        id: 'settlement-1',
        order_id: 'order-614',
        guide_id: 'guide-1',
        gmv_twd: 1200,
        commission_twd: 0,
        net_twd: 1200,
        rules_version: 'r1',
      },
      error: null,
    },
    {
      table: 'payout_items',
      direct: false,
      result: {
        data: {
          id: 'reversal-1',
        },
        error: null,
      },
    },
    {
      table: 'audit_logs',
      data: null,
      error: null,
    },
    {
      table: 'audit_logs',
      data: null,
      error: null,
    },
    {
      table: 'guide_balances',
      data: {
        balance_twd: 200,
      },
      error: null,
    },
    {
      table: 'audit_logs',
      data: null,
      error: null,
    },
    {
      table: 'guide_balances',
      data: null,
      error: { message: 'balance update failed' },
    },
  ]);

  await assert.rejects(
    () => recordRefundReversalDb(supabase, { orderId: 'order-614', actor: 'system' }),
    /balance update failed/
  );
});

test('recordRefundReversalDb throws when audit insert fails', async () => {
  const supabase = createMockSupabase([
    {
      table: 'payout_items',
      data: {
        id: 'settlement-1',
        order_id: 'order-614',
        guide_id: 'guide-1',
        gmv_twd: 1200,
        commission_twd: 0,
        net_twd: 1200,
        rules_version: 'r1',
      },
      error: null,
    },
    {
      table: 'payout_items',
      direct: false,
      result: {
        data: {
          id: 'reversal-1',
        },
        error: null,
      },
    },
    {
      table: 'audit_logs',
      data: null,
      error: null,
    },
    {
      table: 'audit_logs',
      data: null,
      error: null,
    },
    {
      table: 'guide_balances',
      data: {
        balance_twd: 200,
      },
      error: null,
    },
    {
      table: 'audit_logs',
      data: null,
      error: { message: 'audit insert failed' },
    },
  ]);

  await assert.rejects(
    () => recordRefundReversalDb(supabase, { orderId: 'order-614', actor: 'system' }),
    /audit insert failed/
  );
});

test('recordRefundReversalDb repairs missing effects on idempotent retry', async () => {
  const supabase = createMockSupabase([
    {
      table: 'payout_items',
      data: {
        id: 'settlement-1',
        order_id: 'order-614',
        guide_id: 'guide-1',
        gmv_twd: 1200,
        commission_twd: 0,
        net_twd: 1200,
        rules_version: 'r1',
      },
      error: null,
    },
    {
      table: 'payout_items',
      direct: false,
      result: {
        data: null,
        error: null,
      },
    },
    {
      table: 'payout_items',
      data: {
        id: 'reversal-1',
      },
      error: null,
    },
    {
      table: 'audit_logs',
      data: null,
      error: null,
    },
    {
      table: 'audit_logs',
      data: null,
      error: null,
    },
    {
      table: 'guide_balances',
      data: {
        balance_twd: 500,
      },
      error: null,
    },
    {
      table: 'audit_logs',
      data: null,
      error: null,
    },
    {
      table: 'guide_balances',
      data: null,
      error: null,
    },
    {
      table: 'audit_logs',
      data: null,
      error: null,
    },
  ]);

  const result = await recordRefundReversalDb(supabase, { orderId: 'order-614', actor: 'system' });

  assert.deepEqual(result, {
    reversed: true,
    repaired: true,
    reversal_id: 'reversal-1',
    before_balance: 500,
    after_balance: -700,
  });
});


test('recordRefundReversalDb treats already-completed reversal as idempotent success, not skipped', async () => {
  const supabase = createMockSupabase([
    {
      table: 'payout_items',
      data: {
        id: 'settlement-1',
        order_id: 'order-614',
        guide_id: 'guide-1',
        gmv_twd: 1200,
        commission_twd: 0,
        net_twd: 1200,
        rules_version: 'r1',
      },
      error: null,
    },
    {
      table: 'payout_items',
      direct: false,
      result: {
        data: null,
        error: null,
      },
    },
    {
      table: 'payout_items',
      data: {
        id: 'reversal-1',
      },
      error: null,
    },
    {
      table: 'audit_logs',
      data: { id: 1 },
      error: null,
    },
    {
      table: 'audit_logs',
      data: {
        id: 2,
        metadata: {
          status: 'completed',
          before_balance: 500,
          after_balance: -700,
          debit: 1200,
        },
      },
      error: null,
    },
  ]);

  const result = await recordRefundReversalDb(supabase, { orderId: 'order-614', actor: 'system' });

  assert.deepEqual(result, {
    reversed: true,
    reversal_id: 'reversal-1',
    skipped: false,
  });
});

test('recordRefundReversalDb skips duplicate debit when an in-progress marker already reflects target balance', async () => {
  const supabase = createMockSupabase([
    {
      table: 'payout_items',
      data: {
        id: 'settlement-1',
        order_id: 'order-614',
        guide_id: 'guide-1',
        gmv_twd: 1200,
        commission_twd: 0,
        net_twd: 1200,
        rules_version: 'r1',
      },
      error: null,
    },
    {
      table: 'payout_items',
      direct: false,
      result: {
        data: {
          id: 'reversal-1',
        },
        error: null,
      },
    },
    {
      table: 'audit_logs',
      data: null,
      error: null,
    },
    {
      table: 'audit_logs',
      data: {
        id: 2,
        metadata: {
          status: 'started',
          before_balance: 500,
          after_balance: -700,
          debit: 1200,
          order_id: 'order-614',
          reversal_id: 'reversal-1',
        },
      },
      error: null,
    },
    {
      table: 'guide_balances',
      data: {
        balance_twd: -700,
      },
      error: null,
    },
    {
      table: 'audit_logs',
      data: { id: 3 },
      error: null,
    },
  ]);

  const result = await recordRefundReversalDb(supabase, { orderId: 'order-614', actor: 'system' });

  assert.deepEqual(result, {
    reversed: true,
    repaired: true,
    reversal_id: 'reversal-1',
    before_balance: 500,
    after_balance: -700,
  });

  const balanceUpserts = supabase.calls.filter(
    (call) => call.table === 'guide_balances' && call.action === 'upsert'
  );
  assert.equal(balanceUpserts.length, 0);
});

test('recordRefundReversalDb writes marker before debit so retry does not double-debit after post-debit failure', async () => {
  const state = {
    balance: 500,
    marker: null,
    reversalId: 'reversal-1',
    failAfterDebitOnce: true,
    debitUpsertCount: 0,
  };

  const supabase = {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle: async () => {
          if (table === 'payout_items') {
            return {
              data: {
                id: 'settlement-1',
                order_id: 'order-614',
                guide_id: 'guide-1',
                gmv_twd: 1200,
                commission_twd: 0,
                net_twd: 1200,
                rules_version: 'r1',
              },
              error: null,
            };
          }
          if (table === 'guide_balances') {
            return { data: { balance_twd: state.balance }, error: null };
          }
          if (table === 'audit_logs') {
            if (chain._action === 'payout_reversal_created') {
              return { data: { id: 1, metadata: { order_id: 'order-614', reversal_id: state.reversalId } }, error: null };
            }
            if (chain._action === 'guide_balance_debited_reversal' && state.marker) {
              return { data: { id: 2, metadata: state.marker }, error: null };
            }
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        upsert: () => {
          if (table === 'payout_items') {
            return {
              select: () => ({ maybeSingle: async () => ({ data: { id: state.reversalId }, error: null }) }),
            };
          }
          if (table === 'guide_balances') {
            return (async () => {
              state.debitUpsertCount += 1;
              state.balance = -700;
              return { data: null, error: null };
            })();
          }
          return { data: null, error: null };
        },
        insert: async (payload) => {
          if (table === 'audit_logs' && payload?.action === 'guide_balance_debited_reversal') {
            state.marker = payload.metadata;
            if (state.failAfterDebitOnce) {
              state.failAfterDebitOnce = false;
              return { data: null, error: { message: 'audit marker failed after debit' } };
            }
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
      };

      const eqOrig = chain.eq;
      chain.eq = (field, value) => {
        if (table === 'audit_logs' && field === 'action') chain._action = value;
        return eqOrig();
      };
      return chain;
    },
  };

  await assert.rejects(
    () => recordRefundReversalDb(supabase, { orderId: 'order-614', actor: 'system' }),
    /audit marker failed after debit/
  );

  const retry = await recordRefundReversalDb(supabase, { orderId: 'order-614', actor: 'system' });
  assert.equal(state.debitUpsertCount, 1);
  assert.equal(state.balance, -700);
  assert.equal(retry.reversed, true);
});

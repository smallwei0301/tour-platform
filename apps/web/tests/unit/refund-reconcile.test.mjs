/**
 * Behavioral tests for issue #481 — refund-reconcile cron logic
 *
 * Since the cron script is a top-level module (no exports), we test the
 * logic patterns directly by importing and mocking the two key dependencies:
 *   - queryTradeInfo (from ecpay-query.mjs)
 *   - processRefundCallbackDb (from db.mjs)
 *
 * We re-implement the core reconciliation loop inline so we can drive it with
 * mock inputs, verifying the behavioral contracts without hitting real APIs or
 * the database.
 *
 * Run: node --test tests/unit/refund-reconcile.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Inline reconcile loop (mirrors refund-reconcile.mjs logic exactly)
// This is extracted for testability — any change to cron logic must be
// reflected here to keep the contract tests honest.
// ---------------------------------------------------------------------------

/**
 * Core reconcile loop — processes a list of stale orders using provided
 * dependency functions so the logic can be tested with mocks.
 *
 * @param {{
 *   orders: Array<{
 *     id: string,
 *     payments: { merchant_trade_no: string, trade_no: string } | null,
 *     refund_requests: { id: string, retry_count: number, last_error: string|null, status: string }[] | null,
 *   }>,
 *   queryTradeInfo: (opts: object) => Promise<{ tradeStatus: string, tradeNo?: string, raw?: object }>,
 *   processRefundCallbackDb: (supabase: object, opts: object) => Promise<{ alreadyRefunded: boolean, orderId: string, refundRequestId: string|null }>,
 *   updateRefundRequest: (id: string, payload: object) => Promise<{ error: object|null }>,
 *   supabase: object,
 *   merchantId: string,
 *   hashKey: string,
 *   hashIV: string,
 *   isSandbox: boolean,
 *   retryAlertThreshold: number,
 *   onAlert?: (msg: string) => Promise<void>,
 * }} opts
 * @returns {Promise<{ total: number, synced: number, alreadyRefunded: number, retried: number, alerted: number, errors: Array }>}
 */
async function runReconcileLoop({
  orders,
  queryTradeInfo,
  processRefundCallbackDb,
  updateRefundRequest,
  supabase,
  merchantId,
  hashKey,
  hashIV,
  isSandbox = true,
  retryAlertThreshold = 5,
  onAlert = async () => {},
}) {
  const summary = {
    total: orders.length,
    synced: 0,
    alreadyRefunded: 0,
    retried: 0,
    alerted: 0,
    errors: [],
  };

  for (const order of orders) {
    const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
    const refundReq = Array.isArray(order.refund_requests)
      ? order.refund_requests.find((r) => r.status === 'approved') ?? order.refund_requests[0]
      : order.refund_requests;

    if (!payment?.merchant_trade_no) {
      summary.errors.push({ orderId: order.id, error: 'no merchant_trade_no' });
      continue;
    }

    let tradeResult;
    try {
      tradeResult = await queryTradeInfo({
        merchantTradeNo: payment.merchant_trade_no,
        merchantId,
        hashKey,
        hashIV,
        isSandbox,
      });
    } catch (err) {
      summary.errors.push({ orderId: order.id, error: err?.message ?? String(err) });
      continue;
    }

    // ECPay TradeStatus === '2' means refund completed
    if (tradeResult.tradeStatus === '2') {
      try {
        const result = await processRefundCallbackDb(supabase, {
          merchantTradeNo: payment.merchant_trade_no,
          tradeNo: tradeResult.tradeNo || payment.trade_no || '',
          rawPayload: tradeResult.raw,
        });

        if (result.alreadyRefunded) {
          summary.alreadyRefunded++;
        } else {
          summary.synced++;
        }
      } catch (err) {
        summary.errors.push({ orderId: order.id, error: err?.message ?? String(err) });
      }
      continue;
    }

    // Not yet refunded — increment retry_count
    if (refundReq?.id) {
      const newRetryCount = (refundReq.retry_count ?? 0) + 1;
      const lastError = `TradeStatus=${tradeResult.tradeStatus ?? 'unknown'} at ${new Date().toISOString()}`;

      const { error: updateErr } = await updateRefundRequest(refundReq.id, {
        retry_count: newRetryCount,
        last_error: lastError,
      });

      if (!updateErr) {
        summary.retried++;
      }

      if (newRetryCount >= retryAlertThreshold) {
        await onAlert(`Order ${order.id} retried ${newRetryCount} times — TradeStatus=${tradeResult.tradeStatus}`);
        summary.alerted++;
      }
    } else {
      summary.errors.push({ orderId: order.id, error: 'no refund_request row' });
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeOrder({
  id = 'order-1',
  merchantTradeNo = 'MTN001',
  tradeNo = 'TN001',
  refundReqId = 'rr-1',
  retryCount = 0,
  refundReqStatus = 'approved',
} = {}) {
  return {
    id,
    payments: { merchant_trade_no: merchantTradeNo, trade_no: tradeNo },
    refund_requests: [{ id: refundReqId, retry_count: retryCount, last_error: null, status: refundReqStatus }],
  };
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('issue #481 — refund-reconcile cron behavioral contract', () => {
  it('TC1: queryTradeInfo returns tradeStatus="2" → processRefundCallbackDb called with correct args', async () => {
    const calls = [];

    const mockQueryTradeInfo = async (opts) => {
      calls.push({ fn: 'queryTradeInfo', opts });
      return { tradeStatus: '2', tradeNo: 'ECPAY-TN', raw: { TradeStatus: '2' } };
    };

    const mockProcessRefundCallbackDb = async (supabase, opts) => {
      calls.push({ fn: 'processRefundCallbackDb', opts });
      return { alreadyRefunded: false, orderId: 'order-1', refundRequestId: 'rr-1' };
    };

    const order = makeOrder({ id: 'order-1', merchantTradeNo: 'MTN001', tradeNo: 'TN001' });

    const summary = await runReconcileLoop({
      orders: [order],
      queryTradeInfo: mockQueryTradeInfo,
      processRefundCallbackDb: mockProcessRefundCallbackDb,
      updateRefundRequest: async () => ({ error: null }),
      supabase: {},
      merchantId: 'MID',
      hashKey: 'HK',
      hashIV: 'HI',
    });

    assert.strictEqual(summary.synced, 1, 'synced count should be 1');
    assert.strictEqual(summary.errors.length, 0, 'no errors');

    const dbCall = calls.find((c) => c.fn === 'processRefundCallbackDb');
    assert.ok(dbCall, 'processRefundCallbackDb must be called');
    assert.strictEqual(dbCall.opts.merchantTradeNo, 'MTN001');
    assert.strictEqual(dbCall.opts.tradeNo, 'ECPAY-TN', 'tradeNo should come from queryTradeInfo response');
    assert.deepEqual(dbCall.opts.rawPayload, { TradeStatus: '2' });
  });

  it('TC2: queryTradeInfo returns tradeStatus="1" (not refunded) → processRefundCallbackDb NOT called, retry_count incremented', async () => {
    const calls = [];

    const mockQueryTradeInfo = async () => {
      calls.push({ fn: 'queryTradeInfo' });
      return { tradeStatus: '1', tradeNo: '', raw: {} };
    };

    const mockProcessRefundCallbackDb = async () => {
      calls.push({ fn: 'processRefundCallbackDb' });
      return { alreadyRefunded: false, orderId: 'order-2', refundRequestId: null };
    };

    const updates = [];
    const mockUpdateRefundRequest = async (id, payload) => {
      updates.push({ id, payload });
      return { error: null };
    };

    const order = makeOrder({ id: 'order-2', merchantTradeNo: 'MTN002', refundReqId: 'rr-2', retryCount: 1 });

    const summary = await runReconcileLoop({
      orders: [order],
      queryTradeInfo: mockQueryTradeInfo,
      processRefundCallbackDb: mockProcessRefundCallbackDb,
      updateRefundRequest: mockUpdateRefundRequest,
      supabase: {},
      merchantId: 'MID',
      hashKey: 'HK',
      hashIV: 'HI',
    });

    // processRefundCallbackDb should NOT be called
    const dbCall = calls.find((c) => c.fn === 'processRefundCallbackDb');
    assert.ok(!dbCall, 'processRefundCallbackDb must NOT be called when TradeStatus != 2');

    // retry_count should be incremented
    assert.strictEqual(updates.length, 1, 'updateRefundRequest should be called once');
    assert.strictEqual(updates[0].id, 'rr-2');
    assert.strictEqual(updates[0].payload.retry_count, 2, 'retry_count should be incremented to 2');
    assert.match(updates[0].payload.last_error, /TradeStatus=1/, 'last_error should include TradeStatus');

    assert.strictEqual(summary.retried, 1, 'retried count should be 1');
    assert.strictEqual(summary.synced, 0, 'synced count should be 0');
  });

  it('TC3: queryTradeInfo throws → error logged, retry_count NOT updated, error added to summary', async () => {
    const updates = [];

    const mockQueryTradeInfo = async () => {
      throw new Error('ECPay network timeout');
    };

    const mockProcessRefundCallbackDb = async () => {
      throw new Error('should not be called');
    };

    const mockUpdateRefundRequest = async (id, payload) => {
      updates.push({ id, payload });
      return { error: null };
    };

    const order = makeOrder({ id: 'order-3', merchantTradeNo: 'MTN003', refundReqId: 'rr-3', retryCount: 0 });

    const summary = await runReconcileLoop({
      orders: [order],
      queryTradeInfo: mockQueryTradeInfo,
      processRefundCallbackDb: mockProcessRefundCallbackDb,
      updateRefundRequest: mockUpdateRefundRequest,
      supabase: {},
      merchantId: 'MID',
      hashKey: 'HK',
      hashIV: 'HI',
    });

    assert.strictEqual(summary.errors.length, 1, 'should record one error');
    assert.strictEqual(summary.errors[0].orderId, 'order-3');
    assert.match(summary.errors[0].error, /ECPay network timeout/);

    // No retry or sync
    assert.strictEqual(summary.retried, 0, 'retried should be 0');
    assert.strictEqual(summary.synced, 0, 'synced should be 0');

    // updateRefundRequest should NOT be called (queryTradeInfo threw before that branch)
    assert.strictEqual(updates.length, 0, 'updateRefundRequest must not be called when queryTradeInfo throws');
  });

  it('TC4: second run with same data (alreadyRefunded=true) → idempotent, alreadyRefunded++ not synced++', async () => {
    const dbCalls = [];

    const mockQueryTradeInfo = async () => ({
      tradeStatus: '2',
      tradeNo: 'ECPAY-TN-IDEMPOTENT',
      raw: { TradeStatus: '2' },
    });

    const mockProcessRefundCallbackDb = async (_supabase, opts) => {
      dbCalls.push(opts);
      // Simulate second run: event already exists
      return { alreadyRefunded: true, orderId: 'order-4', refundRequestId: null };
    };

    const order = makeOrder({ id: 'order-4', merchantTradeNo: 'MTN004' });

    const summary = await runReconcileLoop({
      orders: [order],
      queryTradeInfo: mockQueryTradeInfo,
      processRefundCallbackDb: mockProcessRefundCallbackDb,
      updateRefundRequest: async () => ({ error: null }),
      supabase: {},
      merchantId: 'MID',
      hashKey: 'HK',
      hashIV: 'HI',
    });

    assert.strictEqual(summary.alreadyRefunded, 1, 'alreadyRefunded should be incremented');
    assert.strictEqual(summary.synced, 0, 'synced should NOT be incremented on duplicate');
    assert.strictEqual(summary.errors.length, 0, 'no errors on idempotent run');

    // processRefundCallbackDb IS still called (to let it perform idempotency check internally)
    assert.strictEqual(dbCalls.length, 1, 'processRefundCallbackDb should be called once even on duplicate');
    assert.strictEqual(dbCalls[0].merchantTradeNo, 'MTN004');
  });
});

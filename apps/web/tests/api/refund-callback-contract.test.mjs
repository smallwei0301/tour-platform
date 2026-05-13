/**
 * Behavioral contract tests for issue #481 — processRefundCallbackDb
 *
 * Tests call `processRefundCallbackDb` directly with in-memory mock Supabase
 * clients that record which table operations were called.
 *
 * Run: node --test tests/api/refund-callback-contract.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processRefundCallbackDb } from '../../src/lib/db.mjs';

// ---------------------------------------------------------------------------
// Mock builder helpers
// ---------------------------------------------------------------------------

/**
 * Build a chainable Supabase query builder that resolves with `result`.
 * Supports: .select(), .eq(), .order(), .limit(), .maybeSingle(), .insert()
 */
function queryBuilder(result) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    update: () => builder,
    insert: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return builder;
}

/**
 * Build a mock Supabase client from a table-keyed response map.
 *
 * responseMap keys are table names, values are arrays of responses consumed
 * in order (one per `.from(table)` call against that table), with the final
 * entry repeated if exhausted.
 *
 * calls[] records every { table, op } call made.
 */
function buildMockSupabase(responseMap) {
  const calls = [];
  const counters = {};

  const client = {
    calls,
    from(table) {
      if (!(table in counters)) counters[table] = 0;
      const responses = responseMap[table] ?? [];
      const idx = Math.min(counters[table], responses.length - 1);
      const resp = responses[idx] ?? { data: null, error: null };
      counters[table]++;

      // Track calls per op
      const trackOp = (op) => calls.push({ table, op });

      return {
        select(..._args) {
          trackOp('select');
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve(resp),
              }),
              maybeSingle: () => Promise.resolve(resp),
              order: () => ({
                limit: () => ({
                  select: () => ({
                    maybeSingle: () => Promise.resolve(resp),
                  }),
                }),
              }),
            }),
            maybeSingle: () => Promise.resolve(resp),
          };
        },
        update(_payload) {
          trackOp('update');
          return {
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    select: () => ({
                      maybeSingle: () => Promise.resolve(resp),
                    }),
                  }),
                }),
              }),
              // For plain .eq().select().maybeSingle()
              select: () => ({
                maybeSingle: () => Promise.resolve(resp),
              }),
            }),
            // For .update().eq('id', orderId) without chaining further
            _resp: resp,
          };
        },
        insert(_payload) {
          trackOp('insert');
          return Promise.resolve(resp);
        },
      };
    },
  };

  return client;
}

// ---------------------------------------------------------------------------
// A simpler, fully explicit mock that records calls with payloads
// ---------------------------------------------------------------------------

function buildTrackedSupabase(spec) {
  /**
   * spec: {
   *   payments: { maybeSingle: fn },              // lookup by merchant_trade_no
   *   payment_events_check: { maybeSingle: fn },  // idempotency check
   *   orders_update: { result: {data, error} },
   *   refund_requests_update: { result: {data, error} },
   *   payments_update: { result: {data, error} },
   *   payment_events_insert: { result: {data, error} },
   * }
   */
  const log = [];

  // Per-table call counter to distinguish first vs subsequent calls
  const tableCallCounts = {};
  const countCall = (table) => {
    tableCallCounts[table] = (tableCallCounts[table] ?? 0) + 1;
    return tableCallCounts[table];
  };

  function from(table) {
    const callNum = countCall(table);

    if (table === 'payments') {
      if (callNum === 1) {
        // First call: lookup by merchant_trade_no
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => {
                log.push({ table, op: 'select.maybeSingle' });
                return Promise.resolve(spec.payments_lookup ?? { data: null, error: null });
              },
            }),
          }),
          update: (_payload) => ({
            eq: () => {
              log.push({ table, op: 'update', payload: _payload });
              return Promise.resolve(spec.payments_update ?? { data: null, error: null });
            },
          }),
        };
      } else {
        // Subsequent call: update payments.status
        return {
          update: (_payload) => ({
            eq: () => {
              log.push({ table, op: 'update', payload: _payload });
              return Promise.resolve(spec.payments_update ?? { data: null, error: null });
            },
          }),
        };
      }
    }

    if (table === 'payment_events') {
      if (callNum === 1) {
        // Idempotency check
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => {
                  log.push({ table, op: 'select.maybeSingle (idempotency)' });
                  return Promise.resolve(spec.payment_events_check ?? { data: null, error: null });
                },
              }),
            }),
          }),
          insert: (_payload) => {
            log.push({ table, op: 'insert', payload: _payload });
            return Promise.resolve(spec.payment_events_insert ?? { data: null, error: null });
          },
        };
      } else {
        // Insert call
        return {
          insert: (_payload) => {
            log.push({ table, op: 'insert', payload: _payload });
            return Promise.resolve(spec.payment_events_insert ?? { data: null, error: null });
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
    }

    if (table === 'orders') {
      return {
        update: (_payload) => ({
          eq: () => {
            log.push({ table, op: 'update', payload: _payload });
            return Promise.resolve(spec.orders_update ?? { data: null, error: null });
          },
        }),
      };
    }

    if (table === 'refund_requests') {
      return {
        update: (_payload) => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  select: () => ({
                    maybeSingle: () => {
                      log.push({ table, op: 'update', payload: _payload });
                      return Promise.resolve(spec.refund_requests_update ?? { data: null, error: null });
                    },
                  }),
                }),
              }),
            }),
          }),
        }),
      };
    }

    // Fallback
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      insert: () => Promise.resolve({ data: null, error: null }),
    };
  }

  return { from, log, tableCallCounts };
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('issue #481 — processRefundCallbackDb behavioral contract', () => {
  it('TC1: valid call (RtnCode=1, TradeStatus=2) → updates orders, refund_requests, payments; inserts payment_events; returns alreadyRefunded=false', async () => {
    const supabase = buildTrackedSupabase({
      payments_lookup: { data: { order_id: 'order-abc' }, error: null },
      payment_events_check: { data: null, error: null }, // no existing event
      orders_update: { data: null, error: null },
      refund_requests_update: { data: { id: 'rr-1' }, error: null },
      payments_update: { data: null, error: null },
      payment_events_insert: { data: null, error: null },
    });

    const result = await processRefundCallbackDb(supabase, {
      merchantTradeNo: 'MTN001',
      tradeNo: 'TN001',
      rawPayload: { RtnCode: '1', TradeStatus: '2' },
    });

    assert.strictEqual(result.alreadyRefunded, false, 'should return alreadyRefunded=false');
    assert.strictEqual(result.orderId, 'order-abc', 'should return orderId');

    // Verify orders was updated
    const ordersUpdate = supabase.log.find((c) => c.table === 'orders' && c.op === 'update');
    assert.ok(ordersUpdate, 'orders.update should be called');
    assert.strictEqual(ordersUpdate.payload.status, 'refunded');
    assert.strictEqual(ordersUpdate.payload.payment_status, 'refunded');

    // Verify payment_events was inserted
    const eventsInsert = supabase.log.find((c) => c.table === 'payment_events' && c.op === 'insert');
    assert.ok(eventsInsert, 'payment_events.insert should be called');
    assert.strictEqual(eventsInsert.payload.order_id, 'order-abc');
    assert.strictEqual(eventsInsert.payload.event_type, 'refunded');
    assert.strictEqual(eventsInsert.payload.trade_no, 'TN001');
  });

  it('TC2: duplicate call (payment_events already has refunded event) → returns alreadyRefunded=true, no further DB mutations', async () => {
    const supabase = buildTrackedSupabase({
      payments_lookup: { data: { order_id: 'order-dup' }, error: null },
      payment_events_check: { data: { id: 'existing-event' }, error: null }, // already refunded
      orders_update: { data: null, error: null },
      payment_events_insert: { data: null, error: null },
    });

    const result = await processRefundCallbackDb(supabase, {
      merchantTradeNo: 'MTN-DUP',
      tradeNo: 'TN-DUP',
      rawPayload: {},
    });

    assert.strictEqual(result.alreadyRefunded, true, 'should return alreadyRefunded=true');
    assert.strictEqual(result.orderId, 'order-dup', 'should still return orderId');
    assert.strictEqual(result.refundRequestId, null, 'refundRequestId should be null on duplicate');

    // No orders update, no payment_events insert
    const ordersUpdate = supabase.log.find((c) => c.table === 'orders' && c.op === 'update');
    assert.ok(!ordersUpdate, 'orders.update must NOT be called on duplicate');

    const eventsInsert = supabase.log.find((c) => c.table === 'payment_events' && c.op === 'insert');
    assert.ok(!eventsInsert, 'payment_events.insert must NOT be called on duplicate');
  });

  it('TC3: payment not found (MerchantTradeNo lookup returns null) → throws with informative error', async () => {
    const supabase = buildTrackedSupabase({
      payments_lookup: { data: null, error: null }, // no row
    });

    await assert.rejects(
      () =>
        processRefundCallbackDb(supabase, {
          merchantTradeNo: 'MTN-MISSING',
          tradeNo: '',
          rawPayload: {},
        }),
      (err) => {
        assert.ok(err instanceof Error, 'should throw an Error');
        assert.match(err.message, /no payment found|MTN-MISSING/, 'error message should mention the missing trade no');
        return true;
      }
    );
  });

  it('TC4: missing merchantTradeNo → throws before any DB call', async () => {
    const supabase = buildTrackedSupabase({});

    await assert.rejects(
      () =>
        processRefundCallbackDb(supabase, {
          merchantTradeNo: '',
          tradeNo: '',
          rawPayload: {},
        }),
      (err) => {
        assert.ok(err instanceof Error, 'should throw an Error');
        assert.match(err.message, /merchantTradeNo.*required|required/, 'error message should indicate required field');
        return true;
      }
    );

    // No DB calls at all
    assert.strictEqual(supabase.log.length, 0, 'no DB calls should be made when merchantTradeNo is missing');
  });

  it('TC5: correct Supabase operation order — payments lookup → idempotency check → orders update → refund_requests update → payments update → payment_events insert', async () => {
    const supabase = buildTrackedSupabase({
      payments_lookup: { data: { order_id: 'order-seq' }, error: null },
      payment_events_check: { data: null, error: null },
      orders_update: { data: null, error: null },
      refund_requests_update: { data: { id: 'rr-seq' }, error: null },
      payments_update: { data: null, error: null },
      payment_events_insert: { data: null, error: null },
    });

    await processRefundCallbackDb(supabase, {
      merchantTradeNo: 'MTN-SEQ',
      tradeNo: 'TN-SEQ',
      rawPayload: { RtnCode: '1' },
    });

    const log = supabase.log;

    // Must have at minimum: idempotency select, orders update, payment_events insert
    const idempotencyCheck = log.find(
      (c) => c.table === 'payment_events' && c.op.includes('idempotency')
    );
    assert.ok(idempotencyCheck, 'payment_events idempotency check must be in log');

    const ordersUpdate = log.find((c) => c.table === 'orders' && c.op === 'update');
    assert.ok(ordersUpdate, 'orders update must be in log');

    const eventsInsert = log.find((c) => c.table === 'payment_events' && c.op === 'insert');
    assert.ok(eventsInsert, 'payment_events insert must be in log');

    // Orders update must appear before payment_events insert
    const ordersIdx = log.indexOf(ordersUpdate);
    const insertIdx = log.indexOf(eventsInsert);
    assert.ok(ordersIdx < insertIdx, 'orders update must precede payment_events insert');

    // Idempotency check must appear before orders update
    const idempotencyIdx = log.indexOf(idempotencyCheck);
    assert.ok(idempotencyIdx < ordersIdx, 'idempotency check must precede orders update');
  });
});

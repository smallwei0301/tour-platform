import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { __setSupabaseClientForTest, upsertEcpayPaymentAttemptDb } from '../../src/lib/db.mjs';

const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function setSupabaseEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
}

function restoreEnv() {
  process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.SUPABASE_SERVICE_ROLE_KEY;
}

beforeEach(() => {
  setSupabaseEnv();
  __setSupabaseClientForTest(null);
});

afterEach(() => {
  __setSupabaseClientForTest(null);
  restoreEnv();
});

test('reuses existing pending payment attempt for same order/provider (no ON CONFLICT path)', async () => {
  const existing = {
    id: '11111111-1111-1111-1111-111111111111',
    order_id: '22222222-2222-2222-2222-222222222222',
    merchant_trade_no: 'EXISTINGTRADE123',
    status: 'pending',
  };

  let insertCalled = false;

  const supabase = {
    from(table) {
      assert.equal(table, 'payments');
      return {
        select() {
          return {
            eq() { return this; },
            order() { return this; },
            limit() { return this; },
            async maybeSingle() {
              return { data: existing, error: null };
            },
          };
        },
        insert() {
          insertCalled = true;
          throw new Error('insert should not be called when existing pending payment is found');
        },
      };
    },
  };

  __setSupabaseClientForTest(supabase);

  const result = await upsertEcpayPaymentAttemptDb({
    orderId: existing.order_id,
    merchantTradeNo: 'NEWTRADE999',
    amountTwd: 1234,
  });

  assert.equal(insertCalled, false);
  assert.equal(result.id, existing.id);
  assert.equal(result.orderId, existing.order_id);
  assert.equal(result.merchantTradeNo, existing.merchant_trade_no);
  assert.equal(result.status, 'pending');
  assert.equal(result.reused, true);
});

test('creates pending payment attempt when none exists', async () => {
  const created = {
    id: '33333333-3333-3333-3333-333333333333',
    order_id: '44444444-4444-4444-4444-444444444444',
    merchant_trade_no: 'NEWTRADE123456',
    status: 'pending',
  };

  let insertedPayload = null;

  const supabase = {
    from(table) {
      assert.equal(table, 'payments');
      return {
        select() {
          return {
            eq() { return this; },
            order() { return this; },
            limit() { return this; },
            async maybeSingle() {
              return { data: null, error: null };
            },
          };
        },
        insert(payload) {
          insertedPayload = payload;
          return {
            select() {
              return {
                async single() {
                  return { data: created, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  __setSupabaseClientForTest(supabase);

  const result = await upsertEcpayPaymentAttemptDb({
    orderId: created.order_id,
    merchantTradeNo: created.merchant_trade_no,
    amountTwd: 4321,
  });

  assert.equal(insertedPayload.order_id, created.order_id);
  assert.equal(insertedPayload.provider, 'ecpay');
  assert.equal(insertedPayload.merchant_trade_no, created.merchant_trade_no);
  assert.equal(insertedPayload.amount_twd, 4321);
  assert.equal(result.id, created.id);
  assert.equal(result.reused, false);
});

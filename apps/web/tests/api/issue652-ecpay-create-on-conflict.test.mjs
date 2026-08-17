import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';
import { __resetEcpayPaymentAttemptsForTest, upsertEcpayPaymentAttemptDb } from '../../src/lib/payment/db-payment-attempt.mjs';
import { buildEcpayCheckoutParams } from '../../src/lib/ecpay-create-orchestration.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const createRoute = readFileSync(join(__dirname, '../../app/api/payments/ecpay/create/route.ts'), 'utf8');

const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function setSupabaseEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-placeholder';
}

function restoreEnv() {
  process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.SUPABASE_SERVICE_ROLE_KEY;
}

beforeEach(() => {
  setSupabaseEnv();
  __setSupabaseClientForTest(null);
  __resetEcpayPaymentAttemptsForTest();
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

test('concurrent payment-attempt unique conflict reuses the winner instead of returning a 500', async () => {
  const existing = {
    id: '55555555-5555-5555-5555-555555555555',
    order_id: '66666666-6666-6666-6666-666666666666',
    merchant_trade_no: 'WINNERTRADE123',
    status: 'pending',
  };
  let lookupCount = 0;
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
              lookupCount += 1;
              return { data: lookupCount === 1 ? null : existing, error: null };
            },
          };
        },
        insert() {
          return {
            select() {
              return {
                async single() {
                  return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
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
    orderId: existing.order_id,
    merchantTradeNo: 'LOSERTRADE123',
    amountTwd: 4321,
  });

  assert.equal(lookupCount, 2);
  assert.deepEqual(result, {
    id: existing.id,
    orderId: existing.order_id,
    merchantTradeNo: existing.merchant_trade_no,
    status: 'pending',
    reused: true,
  });
});

test('in-memory payment-attempt fallback keeps the persisted result contract', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const result = await upsertEcpayPaymentAttemptDb({
    orderId: '77777777-7777-7777-7777-777777777777',
    merchantTradeNo: 'SIMULATEDTRADE1',
    amountTwd: 4321,
  });

  assert.deepEqual(result, {
    id: 'memory-ecpay-1',
    orderId: '77777777-7777-7777-7777-777777777777',
    merchantTradeNo: 'SIMULATEDTRADE1',
    status: 'pending',
    reused: false,
    simulated: true,
  });
  assert.deepEqual(
    await upsertEcpayPaymentAttemptDb({
      orderId: '77777777-7777-7777-7777-777777777777', merchantTradeNo: 'RETRYTRADE1815', amountTwd: 4321,
    }),
    { ...result, reused: true },
  );
});

test('route orchestration uses persisted/reused merchantTradeNo for checkout params', () => {
  const persistedMerchantTradeNo = 'EXISTINGTRADE123';
  const generatedMerchantTradeNo = 'NEWTRADE999';

  const params = buildEcpayCheckoutParams({
    merchantId: '2000132',
    merchantTradeNo: persistedMerchantTradeNo,
    tradeDate: '2026/05/21 11:22:33',
    totalTwd: 999,
    title: '測試行程',
    callbackUrl: 'https://example.com/api/payments/ecpay/callback',
    returnUrl: 'https://example.com/order/success?orderId=o1',
    orderId: 'o1',
    contactEmail: 'u@example.com',
  });

  assert.equal(params.MerchantTradeNo, persistedMerchantTradeNo);
  assert.notEqual(params.MerchantTradeNo, generatedMerchantTradeNo);
});

test('create route wires checkout params with paymentAttempt.merchantTradeNo', () => {
  assert.match(createRoute, /const paymentAttempt = await upsertEcpayPaymentAttemptDb\(/);
  assert.match(createRoute, /const merchantTradeNo = paymentAttempt\.merchantTradeNo/);
  assert.match(createRoute, /buildEcpayCheckoutParams\(\{[\s\S]*merchantTradeNo[\s\S]*\}\)/);
});

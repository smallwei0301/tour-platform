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

// The old SELECT/INSERT + 23505 fallback did not serialize orders when no
// suitable uniqueness constraint existed. Preserve create/reuse/concurrency
// assertions through the order-locked RPC contract instead of assuming one.
const orderId = '22222222-2222-4222-8222-222222222222';
function installAdmission({ reused, amountTwd = 1234 }) {
  const row = { outcome: reused ? 'reuse' : 'create', id: '11111111-1111-4111-8111-111111111111',
    orderId, provider: 'ecpay', merchantTradeNo: 'PERSISTED123', status: 'pending', amountTwd, reused };
  const calls = [];
  __setSupabaseClientForTest({
    from() { throw new Error('payment SELECT/INSERT fallback is forbidden'); },
    async rpc(name, args) {
      assert.equal(name, 'fn_admit_initial_payment_attempt');
      assert.equal(args.p_order_id, orderId);
      assert.equal(args.p_provider, 'ecpay');
      calls.push(args);
      return { data: row, error: null };
    },
  });
  return { row, calls };
}

test('reuses the persisted same-order ECPay identity returned by atomic admission', async () => {
  const { calls } = installAdmission({ reused: true });
  const result = await upsertEcpayPaymentAttemptDb({ orderId, merchantTradeNo: 'NEWTRADE999', amountTwd: 1234 });
  assert.deepEqual(result, { id: '11111111-1111-4111-8111-111111111111', orderId,
    merchantTradeNo: 'PERSISTED123', status: 'pending', reused: true });
  assert.equal(calls.length, 1);
});

test('creates a pending payment only through atomic admission when none exists', async () => {
  const { calls } = installAdmission({ reused: false });
  const result = await upsertEcpayPaymentAttemptDb({ orderId, merchantTradeNo: 'NEWTRADE123456', amountTwd: 1234 });
  assert.equal(result.reused, false);
  assert.equal(result.merchantTradeNo, 'PERSISTED123');
  assert.equal(calls[0].p_merchant_trade_no, 'NEWTRADE123456');
});

test('concurrent callers preserve the atomic winner instead of racing direct inserts', async () => {
  const { calls } = installAdmission({ reused: true, amountTwd: 4321 });
  const [first, second] = await Promise.all([
    upsertEcpayPaymentAttemptDb({ orderId, merchantTradeNo: 'FIRST123', amountTwd: 4321 }),
    upsertEcpayPaymentAttemptDb({ orderId, merchantTradeNo: 'SECOND123', amountTwd: 4321 }),
  ]);
  assert.equal(calls.length, 2);
  assert.deepEqual(first, second);
  assert.equal(second.merchantTradeNo, 'PERSISTED123');
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

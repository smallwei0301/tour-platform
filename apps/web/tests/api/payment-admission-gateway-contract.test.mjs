import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMaterializedOrdersForPaymentTest, __seedMaterializedOrderForPaymentTest } from '../../src/lib/payment/db-payment-detail.mjs';
import { admitInitialPaymentAttemptDb, __resetPaymentAdmissionForTest, __seedPaymentAdmissionAttemptsForTest } from '../../src/lib/payment/db-payment-admission.mjs';

const orderId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const order = (patch = {}) => ({
  id: orderId, bookingId, status: 'pending_payment', paymentStatus: 'pending', totalTwd: 1200,
  booking: { id: bookingId, order_id: orderId, status: 'draft' },
  items: [{ order_id: orderId, booking_id: bookingId, item_type: 'activity_booking', subtotal_amount: 1200 }],
  ...patch,
});
const input = (provider = 'ecpay', merchantTradeNo = 'FIRSTATTEMPT') => ({ orderId, provider, merchantTradeNo });
const attempt = (patch = {}) => ({
  id: '33333333-3333-4333-8333-333333333333', order_id: orderId,
  provider: 'ecpay', status: 'pending', merchant_trade_no: 'EXISTINGATTEMPT', amount_twd: 1200,
  ...patch,
});

beforeEach(() => {
  for (const key of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[key];
  __resetMaterializedOrdersForPaymentTest();
  __resetPaymentAdmissionForTest();
  __seedMaterializedOrderForPaymentTest(order());
});

test('simulated concurrent same-provider calls reuse one attempt and its first trade number', async () => {
  const [first, second] = await Promise.all([
    admitInitialPaymentAttemptDb(input()), admitInitialPaymentAttemptDb(input('ecpay', 'SECONDATTEMPT')),
  ]);
  assert.equal(first.outcome, 'create');
  assert.equal(second.outcome, 'reuse');
  assert.equal(first.id, second.id);
  assert.equal(first.merchantTradeNo, second.merchantTradeNo);
  assert.equal(first.amountTwd, 1200);
  assert.equal(first.simulated, true);
});

test('simulated cross-provider race admits one provider and holds the other', async () => {
  const results = await Promise.all([admitInitialPaymentAttemptDb(input()), admitInitialPaymentAttemptDb(input('transfer'))]);
  assert.deepEqual(results.map((r) => r.outcome), ['create', 'hold']);
  assert.equal(results[1].code, 'PAYMENT_PROVIDER_CONFLICT');
  assert.equal((await admitInitialPaymentAttemptDb(input())).id, results[0].id);
});

test('same transfer reuses its exact row; manual reconciliation never inserts a new row', async () => {
  __seedPaymentAdmissionAttemptsForTest(orderId, [attempt({ provider: 'transfer', merchant_trade_no: null, trade_no: 'TRANSFERATTEMPT' })]);
  assert.equal((await admitInitialPaymentAttemptDb(input('transfer'))).merchantTradeNo, 'TRANSFERATTEMPT');
  const manual = await admitInitialPaymentAttemptDb(input('manual'));
  assert.equal(manual.code, 'TRANSFER_RECONCILIATION_REQUIRED');
  assert.equal(manual.id, attempt().id);
});

test('manual initiation remains held until the entire manual settlement is wired atomically', async () => {
  assert.equal((await admitInitialPaymentAttemptDb(input('manual'))).code, 'MANUAL_SETTLEMENT_REQUIRED');
  assert.equal((await admitInitialPaymentAttemptDb(input())).outcome, 'create');
});

test('existing pending manual rows remain held and never become a reusable launch outcome', async () => {
  __seedPaymentAdmissionAttemptsForTest(orderId, [attempt({ provider: 'manual' })]);
  assert.equal((await admitInitialPaymentAttemptDb(input('manual'))).code, 'MANUAL_SETTLEMENT_REQUIRED');
  const data = { outcome: 'reuse', id: attempt().id, orderId, provider: 'manual',
    merchantTradeNo: 'EXISTINGATTEMPT', status: 'pending', amountTwd: 1200, reused: true };
  await assert.rejects(admitInitialPaymentAttemptDb(input('manual'), { async rpc() { return { data, error: null }; } }));
});

for (const status of ['created', 'processing', 'authorized', 'failed', 'cancelled', 'paid', 'refunded', null, 'unrecognized']) {
  test(`simulated ${status} never releases admission from a local status alone`, async () => {
    __seedPaymentAdmissionAttemptsForTest(orderId, [attempt({ status })]);
    assert.equal((await admitInitialPaymentAttemptDb(input())).code, 'PAYMENT_RECONCILIATION_REQUIRED');
    assert.equal((await admitInitialPaymentAttemptDb(input('manual'))).outcome, 'hold');
  });
}

test('pending with provider query/unknown evidence holds before relaunch or provider switch', async () => {
  for (const patch of [{ provider_status: '0' }, { provider_status: 'unknown' }, { last_provider_query_payload: { source: 'query_trade_info' } }]) {
    __seedPaymentAdmissionAttemptsForTest(orderId, [attempt(patch)]);
    assert.equal((await admitInitialPaymentAttemptDb(input())).code, 'PAYMENT_RECONCILIATION_REQUIRED');
  }
});

test('expired deadline, invalid aggregate and terminal orders cannot create or reopen attempts', async () => {
  for (const patch of [{ paymentDeadlineAt: '2000-01-01T00:00:00Z' }, { paymentDeadlineAt: 'bad-date' },
    { status: 'cancelled_unpaid' }, { status: 'refunded' }, { status: 'paid', paymentStatus: 'paid' }, { items: [] }]) {
    __seedMaterializedOrderForPaymentTest(order(patch));
    assert.equal((await admitInitialPaymentAttemptDb(input())).outcome, 'hold');
  }
});

test('ambiguous rows hold instead of selecting the newest payment', async () => {
  __seedPaymentAdmissionAttemptsForTest(orderId, [attempt(), attempt({ id: '44444444-4444-4444-8444-444444444444', provider: 'transfer' })]);
  assert.equal((await admitInitialPaymentAttemptDb(input())).code, 'PAYMENT_RECONCILIATION_REQUIRED');
});

test('ECPay merchant identity cannot be substituted with a provider trade number', async () => {
  __seedPaymentAdmissionAttemptsForTest(orderId, [attempt({ merchant_trade_no: null, trade_no: 'ECPAYPROVIDERTRADE' })]);
  assert.equal((await admitInitialPaymentAttemptDb(input())).code, 'PAYMENT_RECONCILIATION_REQUIRED');
});

test('contradictory capture/paid evidence or malformed stored trade number holds', async () => {
  for (const patch of [{ paid_at: '2026-10-05T00:00:00Z' }, { captured_amount_twd: 1200 }, { captured_amount_twd: null }, { merchant_trade_no: 'invalid trade' }]) {
    __seedPaymentAdmissionAttemptsForTest(orderId, [attempt(patch)]);
    const response = await admitInitialPaymentAttemptDb(input());
    assert.equal(response.code, 'PAYMENT_RECONCILIATION_REQUIRED');
    assert.equal(response.simulated, true);
  }
});

test('a null or coerced monetary aggregate is not materialized even when Number would coerce it to zero', async () => {
  for (const subtotal of [null, '', false]) {
    __seedMaterializedOrderForPaymentTest(order({ totalTwd: 0,
      items: [{ ...order().items[0], subtotal_amount: subtotal }] }));
    const response = await admitInitialPaymentAttemptDb(input());
    assert.equal(response.code, 'ORDER_NOT_MATERIALIZED');
    assert.equal(response.simulated, true);
  }
});

test('merchant trade numbers are ASCII-only for inputs, stored identity and RPC responses', async () => {
  for (const merchantTradeNo of ['TRADEK', 'TRADEſ']) {
    await assert.rejects(admitInitialPaymentAttemptDb(input('ecpay', merchantTradeNo)));
    __seedPaymentAdmissionAttemptsForTest(orderId, [attempt({ merchant_trade_no: merchantTradeNo })]);
    assert.equal((await admitInitialPaymentAttemptDb(input())).code, 'PAYMENT_RECONCILIATION_REQUIRED');
    const data = { outcome: 'reuse', id: attempt().id, orderId, provider: 'ecpay',
      merchantTradeNo, status: 'pending', amountTwd: 1200, reused: true };
    await assert.rejects(admitInitialPaymentAttemptDb(input(), { async rpc() { return { data, error: null }; } }));
  }
});

test('stored and RPC merchant identity cannot contain a final line terminator', async () => {
  for (const merchantTradeNo of ['TRADE\n', 'TRADE\u2028', 'TRADE\u2029']) {
    __seedPaymentAdmissionAttemptsForTest(orderId, [attempt({ merchant_trade_no: merchantTradeNo })]);
    assert.equal((await admitInitialPaymentAttemptDb(input())).code, 'PAYMENT_RECONCILIATION_REQUIRED');
    const data = { outcome: 'reuse', id: attempt().id, orderId, provider: 'ecpay',
      merchantTradeNo, status: 'pending', amountTwd: 1200, reused: true };
    await assert.rejects(admitInitialPaymentAttemptDb(input(), { async rpc() { return { data, error: null }; } }));
  }
});

test('gateway calls only one admission RPC, never sends caller-controlled amount or performs a direct insert', async () => {
  let calls = 0;
  const rpcResult = { outcome: 'create', ...attempt(), orderId, merchantTradeNo: 'FIRSTATTEMPT', amountTwd: 1200, reused: false };
  const db = { from() { throw new Error('direct table writes are forbidden'); }, async rpc(name, args) {
    calls += 1;
    assert.equal(name, 'fn_admit_initial_payment_attempt');
    assert.deepEqual(args, { p_order_id: orderId, p_provider: 'ecpay', p_merchant_trade_no: 'FIRSTATTEMPT' });
    return { data: rpcResult, error: null };
  } };
  assert.equal((await admitInitialPaymentAttemptDb({ ...input(), amountTwd: 1 }, db)).amountTwd, 1200);
  assert.equal(calls, 1);
});

test('RPC error, timeout, or malformed response cannot fall back to a local create', async () => {
  for (const rpc of [async () => ({ data: null, error: { code: '42883', message: 'function missing' } }),
    async () => { throw new Error('timeout'); }, async () => ({ data: { outcome: 'create' }, error: null })]) {
    await assert.rejects(admitInitialPaymentAttemptDb(input(), { rpc }));
  }
  assert.equal((await admitInitialPaymentAttemptDb(input())).outcome, 'create');
});

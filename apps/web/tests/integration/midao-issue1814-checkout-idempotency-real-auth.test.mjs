import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import pg from 'pg';

import { createHttpCookieJar } from './support/http-cookie-jar.mjs';

const TRAVELER_ID = '55555555-5555-4555-8555-555555555555';
const GUIDE_ID = '18140000-0000-4000-8000-000000000021';
const ACTIVITY_ID = '18140000-0000-4000-8000-000000000022';
const PLAN_ID = '18140000-0000-4000-8000-000000000023';
const SCHEDULE_ID = '18140000-0000-4000-8000-000000000024';
const ADDON_ID = '18140000-0000-4000-8000-000000000025';
const START_AT = '2027-01-20T02:00:00.000Z';
const END_AT = '2027-01-20T04:00:00.000Z';
const SCOPE_ID = '18140000-0000-4000-8000-000000000000';
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const API_BASE_URL = process.env.MIDAO_API_BASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

for (const [name, value] of Object.entries({ DATABASE_URL, SUPABASE_URL, API_BASE_URL, ANON_KEY })) {
  assert.ok(value, `issue #1814 requires ${name}`);
}
for (const [name, value] of Object.entries({ SUPABASE_URL, API_BASE_URL })) {
  const url = new URL(value);
  assert.equal(url.hostname, '127.0.0.1', `${name} must stay loopback-only`);
}

const databaseLocation = new URL(DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(databaseLocation.protocol), 'integration DB scheme must be PostgreSQL');
assert.equal(databaseLocation.search, '', 'integration DB query overrides are forbidden');
assert.equal(databaseLocation.hash, '', 'integration DB fragments are forbidden');
assert.equal(databaseLocation.hostname, '127.0.0.1', 'integration DB must stay loopback-only');
assert.equal(databaseLocation.port, '54322', 'integration DB must use canonical disposable port');
assert.equal(databaseLocation.pathname, '/postgres', 'integration DB must use canonical disposable database');

let client;

function payload(overrides = {}) {
  return {
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    scheduleId: SCHEDULE_ID,
    startAt: START_AT,
    timezone: 'Asia/Taipei',
    participants: 2,
    sourceChannel: 'web',
    contactName: 'Issue 1814 Traveler',
    contactPhone: '0900001814',
    contactEmail: 'issue1814@example.invalid',
    redeemPoints: 500,
    addonSelections: [{ addonId: ADDON_ID, quantity: 1 }],
    ...overrides,
  };
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { response, status: response.status, body, text };
}

async function loginTraveler() {
  const login = await jsonRequest(new URL('/auth/v1/token?grant_type=password', SUPABASE_URL), {
    method: 'POST', headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.MIDAO_E2E_TRAVELER_EMAIL,
      password: process.env.MIDAO_E2E_TRAVELER_PASSWORD,
    }),
  });
  assert.equal(login.status, 200, login.text);
  assert.equal(login.body?.user?.id, TRAVELER_ID);
  const jar = createHttpCookieJar();
  jar.set(`sb-${new URL(SUPABASE_URL).hostname.split('.', 1)[0]}-auth-token`, encodeURIComponent(JSON.stringify(login.body)));
  return jar;
}

async function callPublic(jar, key, overrides = {}) {
  return jsonRequest(new URL('/api/v2/bookings/draft', API_BASE_URL), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-correlation-id': `issue1814-${key}`,
      cookie: jar.header(),
    },
    body: JSON.stringify(payload(overrides)),
  });
}

async function callPayment(orderId) {
  return jsonRequest(new URL('/api/v2/payments/ecpay/create', API_BASE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
}

async function callLegacyPayment(orderId) {
  return jsonRequest(new URL('/api/payments/ecpay/create', API_BASE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
}

async function state(key = null) {
  const orders = await client.query('SELECT id, total_twd FROM public.orders WHERE activity_id = $1 ORDER BY created_at', [ACTIVITY_ID]);
  const orderIds = orders.rows.map((row) => row.id);
  const bookings = await client.query('SELECT id, order_id FROM public.bookings WHERE activity_id = $1 ORDER BY created_at', [ACTIVITY_ID]);
  const addons = await client.query('SELECT addon_id, quantity, unit_price_twd, subtotal_twd FROM public.order_addons WHERE order_id = ANY($1::uuid[])', [orderIds]);
  const items = await client.query('SELECT item_type, subtotal_amount, metadata FROM public.order_items WHERE order_id = ANY($1::uuid[]) ORDER BY created_at', [orderIds]);
  const ledger = await client.query("SELECT id, order_id, delta FROM public.user_points_ledger WHERE reason = 'redeem_order' AND order_id = ANY($1::uuid[])", [orderIds]);
  const claims = await client.query(`SELECT state, request_hash, response_body FROM public.midao_idempotency_records
    WHERE scope_type = 'checkout' AND scope_id = $1 AND command_name = 'create_booking_draft'
      AND ($2::text IS NULL OR idempotency_key = $2)`, [SCOPE_ID, key]);
  return { orders: orders.rows, bookings: bookings.rows, addons: addons.rows, items: items.rows, ledger: ledger.rows, claims: claims.rows };
}

async function cleanup() {
  const current = await state();
  const orderIds = current.orders.map((row) => row.id);
  const bookingIds = current.bookings.map((row) => row.id);
  await client.query('DELETE FROM public.midao_idempotency_records WHERE scope_type = $1 AND scope_id = $2 AND command_name = $3', ['checkout', SCOPE_ID, 'create_booking_draft']);
  await client.query('DELETE FROM public.user_points_ledger WHERE order_id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.order_items WHERE order_id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.order_addons WHERE order_id = ANY($1::uuid[])', [orderIds]);
  await client.query('UPDATE public.bookings SET order_id = NULL WHERE id = ANY($1::uuid[])', [bookingIds]);
  await client.query('UPDATE public.orders SET booking_id = NULL WHERE id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.bookings WHERE id = ANY($1::uuid[])', [bookingIds]);
  await client.query('DELETE FROM public.orders WHERE id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.user_points_ledger WHERE user_id = $1', [TRAVELER_ID]);
}

async function removeFault() {
  await client.query('DROP TRIGGER IF EXISTS issue1814_materialization_fault ON public.orders');
  await client.query('DROP FUNCTION IF EXISTS public.issue1814_materialization_fault()');
}

async function removeAdmissionFault() {
  await client.query('DROP TRIGGER IF EXISTS issue1893_admission_event_fault ON public.payment_events');
  await client.query('DROP FUNCTION IF EXISTS public.issue1893_admission_event_fault()');
}

async function removeConcurrencyBarrier() {
  await client.query('DROP TRIGGER IF EXISTS issue1814_concurrency_barrier ON public.orders');
  await client.query('DROP FUNCTION IF EXISTS public.issue1814_concurrency_barrier()');
}

function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

async function requestHashFor(overrides = {}) {
  const { createHash } = await import('node:crypto');
  const body = payload(overrides);
  return createHash('sha256').update(canonicalize({
    activityId: body.activityId, planId: body.planId, scheduleId: body.scheduleId ?? null,
    startAt: body.startAt, timezone: body.timezone, participants: body.participants,
    sourceChannel: body.sourceChannel, contactName: body.contactName, contactPhone: body.contactPhone,
    contactEmail: body.contactEmail, customerNote: body.customerNote ?? null,
    addonSelections: body.addonSelections ?? [], redeemPoints: body.redeemPoints,
  }), 'utf8').digest('hex');
}

async function waitForConcurrentDatabaseBarrier() {
  const deadline = Date.now() + 8_000;
  let observed = [];
  while (Date.now() < deadline) {
    const waiting = await client.query(`SELECT pid, wait_event_type, query
      FROM pg_catalog.pg_stat_activity
      WHERE datname = pg_catalog.current_database()
        AND wait_event_type = 'Lock'
      ORDER BY pid`);
    observed = waiting.rows;
    if (waiting.rowCount >= 2) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`same-key requests did not reach the controlled database barrier: ${JSON.stringify(observed)}`);
}

before(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(`INSERT INTO public.guide_profiles(id, slug, display_name, verification_status)
    VALUES ($1, 'issue1814-guide', 'Issue 1814 Guide', 'approved')`, [GUIDE_ID]);
  await client.query(`INSERT INTO public.activities(id, guide_id, guide_slug, title, slug, status)
    VALUES ($1, $2, 'issue1814-guide', 'Issue 1814 Tour', 'issue1814-tour', 'published')`, [ACTIVITY_ID, GUIDE_ID]);
  await client.query(`INSERT INTO public.activity_plans(id, activity_id, name, slug, duration_minutes, price_type, base_price, min_participants, max_participants, booking_type, status, is_year_round)
    VALUES ($1, $2, 'Issue 1814 Plan', 'issue1814-plan', 120, 'per_person', 3700, 1, 8, 'scheduled', 'active', false)`, [PLAN_ID, ACTIVITY_ID]);
  await client.query(`INSERT INTO public.activity_schedules(id, activity_id, plan_id, start_at, end_at, capacity, booked_count, status)
    VALUES ($1, $2, $3, $4, $5, 8, 0, 'open')`, [SCHEDULE_ID, ACTIVITY_ID, PLAN_ID, START_AT, END_AT]);
  await client.query(`INSERT INTO public.activity_addons(id, activity_id, name, price_twd, unit, stock, is_active, sort_order)
    VALUES ($1, $2, 'Issue 1814 午餐', 200, 'per_person', NULL, true, 1)`, [ADDON_ID, ACTIVITY_ID]);
});
beforeEach(async () => { await removeFault(); await removeConcurrencyBarrier(); await removeAdmissionFault(); await cleanup(); await client.query("INSERT INTO public.user_points_ledger(user_id, delta, reason, expires_at) VALUES ($1, 1000, 'adjust', NULL)", [TRAVELER_ID]); });
after(async () => {
  try {
    await removeFault(); await removeConcurrencyBarrier(); await removeAdmissionFault(); await cleanup();
    await client.query('DELETE FROM public.activity_schedules WHERE id = $1', [SCHEDULE_ID]);
    await client.query('DELETE FROM public.activity_addons WHERE id = $1', [ADDON_ID]);
    await client.query('DELETE FROM public.activity_plans WHERE id = $1', [PLAN_ID]);
    await client.query('DELETE FROM public.activities WHERE id = $1', [ACTIVITY_ID]);
    await client.query('DELETE FROM public.guide_profiles WHERE id = $1', [GUIDE_ID]);
  } finally { await client.end(); }
});

test('#1814 RED: sequential same-key replay returns one persisted order, one ledger debit and one add-on snapshot set', async () => {
  const traveler = await loginTraveler();
  const key = 'issue1814-sequential';
  const first = await callPublic(traveler, key);
  const second = await callPublic(traveler, key);
  assert.equal(first.status, 200, first.text);
  assert.equal(second.status, 200, second.text);
  assert.deepEqual(second.body, first.body);
  const after = await state(key);
  assert.equal(after.orders.length, 1);
  assert.equal(after.bookings.length, 1);
  assert.deepEqual(after.addons, [{ addon_id: ADDON_ID, quantity: 1, unit_price_twd: 200, subtotal_twd: 400 }]);
  assert.equal(after.ledger.length, 1);
  assert.equal(Number(after.ledger[0].delta), -500);
  assert.deepEqual(after.claims.map((row) => row.state), ['completed']);
});

for (const scenario of [
  { name: 'basic', overrides: { addonSelections: [], redeemPoints: 0 }, totalTwd: 7400, addonCount: 0, pointsDelta: null },
  { name: 'valid add-on', overrides: { redeemPoints: 0 }, totalTwd: 7800, addonCount: 1, pointsDelta: null },
  { name: 'valid points', overrides: { addonSelections: [] }, totalTwd: 6900, addonCount: 0, pointsDelta: -500 },
]) {
  test(`#1815 release matrix: ${scenario.name} persists one reconciled checkout aggregate`, async () => {
    const traveler = await loginTraveler();
    const key = `issue1815-${scenario.name.replace(/\s+/g, '-')}`;
    const created = await callPublic(traveler, key, scenario.overrides);
    assert.equal(created.status, 200, created.text);
    assert.equal(Number(created.body?.data?.amount), scenario.totalTwd);

    const after = await state(key);
    assert.equal(after.orders.length, 1);
    assert.equal(Number(after.orders[0].total_twd), scenario.totalTwd);
    assert.equal(after.addons.length, scenario.addonCount);
    assert.equal(
      after.items.reduce((sum, item) => sum + Number(item.subtotal_amount), 0),
      scenario.totalTwd,
      'persisted order total must equal its materialized item sum',
    );
    if (scenario.pointsDelta === null) assert.equal(after.ledger.length, 0);
    else assert.deepEqual(after.ledger.map((row) => Number(row.delta)), [scenario.pointsDelta]);

    const payment = await callPayment(after.orders[0].id);
    assert.equal(payment.status, 200, payment.text);
    assert.equal(Number(payment.body?.data?.params?.TotalAmount), scenario.totalTwd);
    const attempts = await client.query('SELECT amount_twd FROM public.payments WHERE order_id = $1', [after.orders[0].id]);
    assert.deepEqual(attempts.rows.map((row) => Number(row.amount_twd)), [scenario.totalTwd]);
  });
}

test('#1814 RED: concurrent same-key HTTP calls have one materialization and one points debit', async () => {
  const traveler = await loginTraveler();
  const key = 'issue1814-concurrent';
  await client.query(`CREATE FUNCTION public.issue1814_concurrency_barrier() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(1814, 1814); RETURN NEW; END; $f$;
    CREATE TRIGGER issue1814_concurrency_barrier BEFORE INSERT ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.issue1814_concurrency_barrier();`);
  const blocker = new pg.Client({ connectionString: DATABASE_URL });
  await blocker.connect();
  try {
    await blocker.query('SELECT pg_catalog.pg_advisory_lock(1814, 1814)');
    const firstPending = callPublic(traveler, key);
    const secondPending = callPublic(traveler, key);
    await waitForConcurrentDatabaseBarrier();
    await blocker.query('SELECT pg_catalog.pg_advisory_unlock(1814, 1814)');
    const [first, second] = await Promise.all([firstPending, secondPending]);
    assert.equal(first.status, 200, first.text);
    assert.equal(second.status, 200, second.text);
    assert.deepEqual(second.body, first.body);
  } finally {
    await blocker.query('SELECT pg_catalog.pg_advisory_unlock(1814, 1814)').catch(() => undefined);
    await blocker.end();
    await removeConcurrencyBarrier();
  }
  const after = await state(key);
  assert.equal(after.orders.length, 1);
  assert.equal(after.bookings.length, 1);
  assert.deepEqual(after.addons, [{ addon_id: ADDON_ID, quantity: 1, unit_price_twd: 200, subtotal_twd: 400 }]);
  assert.equal(after.ledger.length, 1);
  assert.equal(Number(after.ledger[0].delta), -500);
  assert.equal(after.claims.length, 1);
  assert.equal(after.claims[0].state, 'completed');
});

test('#1814 RED: conflict and failed atomic materialization do not expose a payable order, while rollback permits same-key retry', async () => {
  const traveler = await loginTraveler();
  const key = 'issue1814-fault-retry';
  await client.query(`CREATE FUNCTION public.issue1814_materialization_fault() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ISSUE1814_COMPLETION_BOOM'; END; $f$;
    CREATE TRIGGER issue1814_materialization_fault BEFORE INSERT ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.issue1814_materialization_fault();`);
  const failed = await callPublic(traveler, key);
  assert.equal(failed.status, 500, failed.text);
  assert.doesNotMatch(failed.text, /bookingId|orderId|checkoutUrl|paymentUrl/iu);
  const rolledBack = await state(key);
  assert.deepEqual(
    Object.fromEntries(Object.entries(rolledBack).map(([name, rows]) => [name, rows.length])),
    { orders: 0, bookings: 0, addons: 0, items: 0, ledger: 0, claims: 0 },
  );
  await removeFault();
  const retried = await callPublic(traveler, key);
  assert.equal(retried.status, 200, retried.text);
  const conflict = await callPublic(traveler, key, { participants: 3 });
  assert.equal(conflict.status, 409, conflict.text);
  assert.equal(conflict.body?.error?.code, 'IDEMPOTENCY_CONFLICT');
  assert.doesNotMatch(conflict.text, /bookingId|orderId|checkoutUrl|paymentUrl/iu);
  const after = await state(key);
  assert.equal(after.orders.length, 1);
  assert.equal(after.ledger.length, 1);
  assert.equal(after.claims.length, 1);
});

test('#1814 RED: an existing matching processing claim is a non-payable conflict and never creates a second aggregate', async () => {
  const traveler = await loginTraveler();
  const key = 'issue1814-processing';
  const hash = await requestHashFor();
  await client.query(`INSERT INTO public.midao_idempotency_records(
    actor_type, actor_id, command_name, scope_type, scope_id, idempotency_key, request_hash, state, expires_at
  ) VALUES ('traveler', $1, 'create_booking_draft', 'checkout', $2, $3, $4, 'processing', now() + interval '1 day')`, [TRAVELER_ID, SCOPE_ID, key, hash]);
  const result = await callPublic(traveler, key);
  assert.equal(result.status, 409, result.text);
  assert.equal(result.body?.error?.code, 'IDEMPOTENCY_IN_PROGRESS');
  assert.doesNotMatch(result.text, /bookingId|orderId|checkoutUrl|paymentUrl/iu);
  const after = await state(key);
  assert.equal(after.orders.length, 0);
  assert.equal(after.bookings.length, 0);
  assert.equal(after.addons.length, 0);
  assert.equal(after.ledger.length, 0);
  assert.deepEqual(after.claims.map((row) => row.state), ['processing']);
});

test('#1815 release gate: persisted draft amount reconciles before payment, while a broken aggregate is rejected before payment side effects', async () => {
  const traveler = await loginTraveler();
  const created = await callPublic(traveler, 'issue1815-payment-guard');
  assert.equal(created.status, 200, created.text);
  const afterCreate = await state('issue1815-payment-guard');
  assert.equal(afterCreate.orders.length, 1);
  const [order] = afterCreate.orders;
  const payableItems = await client.query('SELECT subtotal_amount FROM public.order_items WHERE order_id = $1', [order.id]);
  assert.equal(
    payableItems.rows.reduce((sum, row) => sum + Number(row.subtotal_amount), 0),
    Number(order.total_twd),
    'release gate must use the committed order total reconciled from order items',
  );
  assert.equal(created.body?.data?.amount, Number(order.total_twd), 'draft response must use the committed order total');

  const [firstPayment, secondPayment] = await Promise.all([callPayment(order.id), callPayment(order.id)]);
  assert.equal(firstPayment.status, 200, firstPayment.text);
  assert.equal(secondPayment.status, 200, secondPayment.text);
  assert.equal(Number(firstPayment.body?.data?.params?.TotalAmount), Number(order.total_twd));
  assert.equal(Number(secondPayment.body?.data?.params?.TotalAmount), Number(order.total_twd));
  assert.equal(
    secondPayment.body?.data?.merchantTradeNo,
    firstPayment.body?.data?.merchantTradeNo,
    'double-click payment requests must reuse one pending payment attempt',
  );
  const legacyPayment = await callLegacyPayment(order.id);
  assert.equal(legacyPayment.status, 200, legacyPayment.text);
  assert.equal(Number(legacyPayment.body?.data?.params?.TotalAmount), Number(order.total_twd));
  assert.equal(
    legacyPayment.body?.data?.merchantTradeNo,
    firstPayment.body?.data?.merchantTradeNo,
    'legacy payment entry must use the same pending payment attempt',
  );
  const createdAttempt = await client.query('SELECT amount_twd FROM public.payments WHERE order_id = $1', [order.id]);
  assert.equal(createdAttempt.rowCount, 1);
  assert.equal(Number(createdAttempt.rows[0].amount_twd), Number(order.total_twd));

  await client.query('DELETE FROM public.order_items WHERE order_id = $1', [order.id]);
  const rejected = await callPayment(order.id);
  assert.equal(rejected.status, 409, rejected.text);
  assert.equal(rejected.body?.error?.code, 'ORDER_NOT_MATERIALIZED');
  assert.doesNotMatch(rejected.text, /MerchantTradeNo|CheckMacValue|paymentUrl|checkoutUrl/iu);
  const legacyRejected = await callLegacyPayment(order.id);
  assert.equal(legacyRejected.status, 409, legacyRejected.text);
  assert.equal(legacyRejected.body?.error?.code, 'ORDER_NOT_MATERIALIZED');
  assert.doesNotMatch(legacyRejected.text, /MerchantTradeNo|CheckMacValue|paymentUrl|checkoutUrl/iu);
  const paymentAttempts = await client.query('SELECT id FROM public.payments WHERE order_id = $1', [order.id]);
  assert.equal(paymentAttempts.rowCount, 1, 'rejected aggregate must not create another payment attempt');
});

const ADMISSION_SIGNATURE = 'public.fn_admit_initial_payment_attempt(uuid,text,text)';
async function admissionOrder(key) {
  const response = await callPublic(await loginTraveler(), key);
  assert.equal(response.status, 200, response.text);
  const current = await state(key);
  assert.equal(current.orders.length, 1);
  return current.orders[0];
}
async function admissionRows(orderId) {
  const payments = await client.query('SELECT id, provider, merchant_trade_no FROM public.payments WHERE order_id = $1', [orderId]);
  const events = await client.query("SELECT payment_id, provider FROM public.payment_events WHERE order_id = $1 AND event_type = 'initiated'", [orderId]);
  return { payments: payments.rows, events: events.rows };
}

test('#1893 admission serializes cross-provider callers at the same order lock', { timeout: 20000 }, async () => {
  const order = await admissionOrder('issue1893-cross-provider');
  const blocker = new pg.Client({ connectionString: DATABASE_URL });
  const contenders = [new pg.Client({ connectionString: DATABASE_URL }), new pg.Client({ connectionString: DATABASE_URL })];
  const pending = [];
  let blockerConnected = false;
  try {
    await blocker.connect();
    blockerConnected = true;
    for (const connection of contenders) {
      await connection.connect();
      await connection.query("SET statement_timeout = '12s'");
    }
    const pids = await Promise.all(contenders.map(async (connection) => (await connection.query('SELECT pg_backend_pid() AS pid')).rows[0].pid));
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM public.orders WHERE id = $1 FOR UPDATE', [order.id]);
    for (const [index, provider] of ['ecpay', 'transfer'].entries()) {
      pending.push(contenders[index].query('SELECT public.fn_admit_initial_payment_attempt($1,$2,$3) AS result',
        [order.id, provider, `ISSUE1893RACE${index}`]).then(result => ({ result }), error => ({ error })));
    }
    const deadline = Date.now() + 8000;
    let blocked = 0;
    while (Date.now() < deadline) {
      const observed = await client.query("SELECT pid FROM pg_catalog.pg_stat_activity WHERE pid = ANY($1::int[]) AND wait_event_type = 'Lock'", [pids]);
      blocked = observed.rowCount;
      if (blocked === 2) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(blocked, 2, 'both independent admission calls must reach the held order lock before release');
    await blocker.query('ROLLBACK');
    const responses = await Promise.all(pending);
    for (const response of responses) assert.equal(response.error, undefined);
    const results = responses.map(response => response.result.rows[0].result);
    assert.deepEqual(results.map(result => result.outcome).sort(), ['create', 'hold']);
    const winner = results.find(result => result.outcome === 'create');
    assert.equal(results.find(result => result.outcome === 'hold').code, 'PAYMENT_PROVIDER_CONFLICT');
    const rows = await admissionRows(order.id);
    assert.equal(rows.payments.length, 1);
    assert.equal(rows.events.length, 1);
    assert.equal(rows.payments[0].id, winner.id);
    assert.equal(rows.payments[0].provider, winner.provider);
    assert.equal(rows.payments[0].merchant_trade_no, winner.merchantTradeNo);
    assert.equal(rows.events[0].payment_id, winner.id);
    assert.equal(rows.events[0].provider, winner.provider);
  } finally {
    // Release the database barrier even when the observation/assertion fails.
    const cleanupErrors = [];
    if (blockerConnected) {
      try { await blocker.query('ROLLBACK'); } catch (error) { cleanupErrors.push(error); }
    }
    await Promise.all(pending);
    const closed = await Promise.allSettled([...contenders, blocker].map(connection => connection.end()));
    cleanupErrors.push(...closed.filter(result => result.status === 'rejected').map(result => result.reason));
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'admission connection cleanup failed');
  }
});

test('#1893 required initiated-event failure rolls back the payment and permits a clean retry', async () => {
  const order = await admissionOrder('issue1893-event-rollback');
  assert.match(order.id, /^[0-9a-f-]{36}$/u);
  try {
    await client.query(`CREATE FUNCTION public.issue1893_admission_event_fault() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        IF NEW.order_id::text = TG_ARGV[0] AND NEW.event_type = 'initiated' THEN
          RAISE EXCEPTION 'issue1893 required-event fault' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END; $f$;
      CREATE TRIGGER issue1893_admission_event_fault BEFORE INSERT ON public.payment_events
        FOR EACH ROW EXECUTE FUNCTION public.issue1893_admission_event_fault('${order.id}');`);
    await assert.rejects(client.query('SELECT public.fn_admit_initial_payment_attempt($1,$2,$3)',
      [order.id, 'ecpay', 'ISSUE1893FAULT']), error => error.code === 'P0001' && /issue1893 required-event fault/u.test(error.message));
    assert.deepEqual(await admissionRows(order.id), { payments: [], events: [] });
  } finally {
    await removeAdmissionFault();
    const remaining = await client.query("SELECT count(*)::int AS count FROM pg_catalog.pg_trigger WHERE tgname = 'issue1893_admission_event_fault'");
    assert.equal(remaining.rows[0].count, 0);
    const functions = await client.query("SELECT to_regprocedure('public.issue1893_admission_event_fault()') AS function");
    assert.equal(functions.rows[0].function, null);
  }
  const retry = await client.query('SELECT public.fn_admit_initial_payment_attempt($1,$2,$3) AS result', [order.id, 'ecpay', 'ISSUE1893RETRY']);
  assert.equal(retry.rows[0].result.outcome, 'create');
  const rows = await admissionRows(order.id);
  assert.equal(rows.payments.length, 1);
  assert.equal(rows.events.length, 1);
});

test('#1893 admission ACL rejects anonymous/authenticated execution and admits the service-role boundary', async () => {
  const originalRole = (await client.query('SELECT current_user AS role')).rows[0].role;
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const acl = await client.query("SELECT has_function_privilege($1, $2, 'EXECUTE') AS allowed", [role, ADMISSION_SIGNATURE]);
    assert.equal(acl.rows[0].allowed, role === 'service_role');
    // Keep a failed role probe from poisoning the fixture cleanup connection.
    const probe = new pg.Client({ connectionString: DATABASE_URL });
    let connected = false;
    let phase = 'connect';
    let primaryError;
    let executionError;
    const connectionErrors = [];
    const annotate = (error, action) => new Error(
      `admission ACL role=${role} phase=${action} ${error.code ?? error.name}: ${error.message}`,
      { cause: error },
    );
    // pg also emits socket errors outside query rejection. Retain them as FAIL,
    // with the role/stage, instead of an unrelated uncaught after-hook error.
    const onConnectionError = error => connectionErrors.push(annotate(error, phase));
    probe.on('error', onConnectionError);
    try {
      await probe.connect();
      connected = true;
      phase = 'initial-role';
      assert.equal((await probe.query('SELECT current_user AS role')).rows[0].role, originalRole);
      phase = 'begin';
      await probe.query('BEGIN');
      // Names come only from this fixed allowlist, never an external role value.
      phase = 'set-role';
      await probe.query(`SET LOCAL ROLE ${role}`);
      phase = 'verify-role';
      assert.equal((await probe.query('SELECT current_user AS role')).rows[0].role, role);
      phase = 'execute';
      await assert.rejects(probe.query("SELECT public.fn_admit_initial_payment_attempt(NULL, 'ecpay', 'ACLPROBE')"), error => {
        executionError = error;
        if (role === 'service_role') return error.code === '22023' && /invalid initial payment admission request/u.test(error.message);
        return error.code === '42501' && /permission denied for function fn_admit_initial_payment_attempt/u.test(error.message);
      });
    } catch (error) {
      primaryError = annotate(error, phase);
      if (executionError && executionError !== error) {
        const rejection = annotate(executionError, phase);
        primaryError = new AggregateError([rejection, primaryError], `${rejection.message}; ${primaryError.message}`);
      }
    } finally {
      const cleanupErrors = [];
      if (connected) {
        phase = 'rollback';
        try { await probe.query('ROLLBACK'); } catch (error) { cleanupErrors.push(annotate(error, phase)); }
        phase = 'restore-role';
        try {
          assert.equal((await probe.query('SELECT current_user AS role')).rows[0].role, originalRole);
        } catch (error) { cleanupErrors.push(annotate(error, phase)); }
      }
      phase = 'close';
      try { await probe.end(); } catch (error) { cleanupErrors.push(annotate(error, phase)); }
      // Do not silently collect a late error after this test has finalized.
      probe.removeListener('error', onConnectionError);
      const errors = [primaryError, ...connectionErrors.filter(error => error.cause !== primaryError?.cause), ...cleanupErrors].filter(Boolean);
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, errors.map(error => error.message).join('; '));
    }
  }
});

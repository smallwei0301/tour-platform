import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import pg from 'pg';

import { createHttpCookieJar } from './support/http-cookie-jar.mjs';

const TRAVELER_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_TRAVELER_ID = '18130000-0000-4000-8000-000000000031';
const GUIDE_ID = '18130000-0000-4000-8000-000000000021';
const ACTIVITY_ID = '18130000-0000-4000-8000-000000000022';
const PLAN_ID = '18130000-0000-4000-8000-000000000023';
const SCHEDULE_ID = '18130000-0000-4000-8000-000000000024';
const START_AT = '2027-01-18T02:00:00.000Z';
const END_AT = '2027-01-18T04:00:00.000Z';
const BASE_TOTAL_TWD = 7_400;
const FUNCTION_SIGNATURE = [
  'public.fn_create_booking_draft_with_addons_and_points_atomic(',
  'uuid,uuid,timestamptz,timestamptz,text,integer,text,text,text,text,text,uuid,jsonb,text,timestamptz,jsonb,integer',
  ')',
].join('');

function requiredUrl(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required`);
  const parsed = new URL(value);
  assert.equal(parsed.protocol, 'http:');
  assert.equal(parsed.hostname, '127.0.0.1');
  return parsed;
}

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const SUPABASE_URL = requiredUrl('SUPABASE_URL');
const API_BASE_URL = requiredUrl('MIDAO_API_BASE_URL');
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(DATABASE_URL, 'isolated PostgreSQL URL is required');
assert.ok(ANON_KEY, 'isolated anon key is required');
assert.ok(SERVICE_ROLE_KEY, 'isolated service-role key is required');

let client;

function publicPayload(overrides = {}) {
  return {
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    scheduleId: SCHEDULE_ID,
    startAt: START_AT,
    timezone: 'Asia/Taipei',
    participants: 2,
    sourceChannel: 'web',
    contactName: 'Issue 1813 Traveler',
    contactPhone: '0900001813',
    contactEmail: 'issue1813-real-auth@example.invalid',
    redeemPoints: 500,
    totalAmount: 1,
    totalTwd: 2,
    amount: 3,
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
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.MIDAO_E2E_TRAVELER_EMAIL,
      password: process.env.MIDAO_E2E_TRAVELER_PASSWORD,
    }),
  });
  assert.equal(login.status, 200, login.text);
  assert.equal(login.body?.user?.id, TRAVELER_ID);
  const jar = createHttpCookieJar();
  const projectRef = SUPABASE_URL.hostname.split('.', 1)[0];
  jar.set(`sb-${projectRef}-auth-token`, encodeURIComponent(JSON.stringify(login.body)));
  return jar;
}

async function createOrUpdateOtherTravelerAuthUser() {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  };
  const body = {
    email: 'issue1813-other@example.invalid',
    password: 'issue1813-other-local-only',
    email_confirm: true,
    user_metadata: { full_name: 'Issue 1813 Other Traveler', role: 'traveler' },
  };
  const timeout = AbortSignal.timeout(30_000);
  let response = await fetch(new URL(`/auth/v1/admin/users/${OTHER_TRAVELER_ID}`, SUPABASE_URL), {
    method: 'PUT', headers, body: JSON.stringify(body), signal: timeout,
  });
  if (response.status === 404) {
    response = await fetch(new URL('/auth/v1/admin/users', SUPABASE_URL), {
      method: 'POST', headers, body: JSON.stringify({ id: OTHER_TRAVELER_ID, ...body }), signal: timeout,
    });
  }
  assert.ok(response.ok, `other traveler GoTrue fixture failed: HTTP ${response.status}`);
}

async function deleteOtherTravelerAuthUser() {
  const response = await fetch(new URL(`/auth/v1/admin/users/${OTHER_TRAVELER_ID}`, SUPABASE_URL), {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(response.ok || response.status === 404, `other traveler GoTrue cleanup failed: HTTP ${response.status}`);
}

async function callPublic(jar, overrides = {}) {
  return jsonRequest(new URL('/api/v2/bookings/draft', API_BASE_URL), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `issue1813-real-${overrides.contactEmail ?? 'public'}`,
      'x-correlation-id': 'issue1813-real-auth',
      cookie: jar.header(),
    },
    body: JSON.stringify(publicPayload(overrides)),
  });
}

async function readState() {
  const orders = await client.query('SELECT id, total_twd, discount_amount FROM public.orders WHERE activity_id = $1', [ACTIVITY_ID]);
  const orderIds = orders.rows.map((row) => row.id);
  const bookings = await client.query('SELECT id, order_id FROM public.bookings WHERE activity_id = $1', [ACTIVITY_ID]);
  const items = await client.query('SELECT order_id, item_type, title, quantity, unit_price, subtotal_amount, metadata FROM public.order_items WHERE order_id = ANY($1::uuid[]) ORDER BY created_at', [orderIds]);
  const redeemLedger = await client.query("SELECT user_id, order_id, delta, reason FROM public.user_points_ledger WHERE reason = 'redeem_order' AND order_id = ANY($1::uuid[])", [orderIds]);
  return { orders: orders.rows, bookings: bookings.rows, items: items.rows, redeemLedger: redeemLedger.rows };
}

function assertNoMaterialization(state, label) {
  assert.deepEqual(
    Object.fromEntries(Object.entries(state).map(([key, rows]) => [key, rows.length])),
    { orders: 0, bookings: 0, items: 0, redeemLedger: 0 },
    label,
  );
}

async function cleanupState() {
  const state = await readState();
  const orderIds = state.orders.map((row) => row.id);
  const bookingIds = state.bookings.map((row) => row.id);
  await client.query('DELETE FROM public.user_points_ledger WHERE order_id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.order_items WHERE order_id = ANY($1::uuid[])', [orderIds]);
  await client.query('UPDATE public.bookings SET order_id = NULL WHERE id = ANY($1::uuid[])', [bookingIds]);
  await client.query('UPDATE public.orders SET booking_id = NULL WHERE id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.bookings WHERE id = ANY($1::uuid[])', [bookingIds]);
  await client.query('DELETE FROM public.orders WHERE id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.user_points_ledger WHERE user_id = ANY($1::uuid[])', [[TRAVELER_ID, OTHER_TRAVELER_ID]]);
}

async function clearFaults() {
  for (const name of ['ledger', 'discount_item', 'total']) {
    await client.query(`DROP TRIGGER IF EXISTS midao_issue1813_${name}_boom ON public.${name === 'ledger' ? 'user_points_ledger' : name === 'discount_item' ? 'order_items' : 'orders'}`);
    await client.query(`DROP FUNCTION IF EXISTS public.midao_issue1813_${name}_boom()`);
  }
}

async function installFault({ name, table, operation, when, marker }) {
  await client.query(`
    CREATE FUNCTION public.midao_issue1813_${name}_boom() RETURNS trigger LANGUAGE plpgsql AS $fault$
    BEGIN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '${marker}'; END; $fault$;
    CREATE TRIGGER midao_issue1813_${name}_boom BEFORE ${operation} ON public.${table}
      FOR EACH ROW ${when ?? ''} EXECUTE FUNCTION public.midao_issue1813_${name}_boom();
  `);
}

before(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await createOrUpdateOtherTravelerAuthUser();
  await client.query(`INSERT INTO public.users(id, role, email, name)
    VALUES ($1, 'traveler', 'issue1813-other@example.invalid', 'Issue 1813 Other Traveler')
    ON CONFLICT (id) DO NOTHING`, [OTHER_TRAVELER_ID]);
  await client.query(`INSERT INTO public.guide_profiles(id, slug, display_name, verification_status)
    VALUES ($1, 'issue1813-auth-guide', 'Issue 1813 Auth Guide', 'approved')`, [GUIDE_ID]);
  await client.query(`INSERT INTO public.activities(id, guide_id, guide_slug, title, slug, status)
    VALUES ($1, $2, 'issue1813-auth-guide', 'Issue 1813 Auth Tour', 'issue1813-auth-tour', 'published')`, [ACTIVITY_ID, GUIDE_ID]);
  await client.query(`INSERT INTO public.activity_plans(id, activity_id, name, slug, duration_minutes, price_type, base_price, min_participants, max_participants, booking_type, status, is_year_round)
    VALUES ($1, $2, 'Issue 1813 Auth Plan', 'issue1813-auth-plan', 120, 'per_person', 3700, 1, 8, 'scheduled', 'active', false)`, [PLAN_ID, ACTIVITY_ID]);
  await client.query(`INSERT INTO public.activity_schedules(id, activity_id, plan_id, start_at, end_at, capacity, booked_count, status)
    VALUES ($1, $2, $3, $4, $5, 8, 0, 'open')`, [SCHEDULE_ID, ACTIVITY_ID, PLAN_ID, START_AT, END_AT]);
});

beforeEach(async () => { await clearFaults(); await cleanupState(); });
after(async () => {
  try {
    await clearFaults();
    await cleanupState();
    await client.query('DELETE FROM public.activity_schedules WHERE id = $1', [SCHEDULE_ID]);
    await client.query('DELETE FROM public.activity_plans WHERE id = $1', [PLAN_ID]);
    await client.query('DELETE FROM public.activities WHERE id = $1', [ACTIVITY_ID]);
    await client.query('DELETE FROM public.guide_profiles WHERE id = $1', [GUIDE_ID]);
    await client.query('DELETE FROM public.users WHERE id = $1', [OTHER_TRAVELER_ID]);
    await deleteOtherTravelerAuthUser();
  } finally {
    await client.end();
  }
});

test('#1813 runtime exposes only a service-role points atomic RPC', async () => {
  const catalog = await client.query(`SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure($1)`, [FUNCTION_SIGNATURE]);
  assert.equal(catalog.rowCount, 1, `missing ${FUNCTION_SIGNATURE}`);
  assert.equal(catalog.rows[0].prosecdef, false);
  const denied = await jsonRequest(new URL('/rest/v1/rpc/fn_create_booking_draft_with_addons_and_points_atomic', SUPABASE_URL), {
    method: 'POST',
    headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.ok([401, 403, 404].includes(denied.status), denied.text);
});

test('#1813 authenticated public draft commits reconciled points ledger, discount item and sole payable total', async () => {
  await client.query("INSERT INTO public.user_points_ledger(user_id, delta, reason, expires_at) VALUES ($1, 1000, 'adjust', NULL)", [TRAVELER_ID]);
  const traveler = await loginTraveler();
  const result = await callPublic(traveler, { travelerId: GUIDE_ID });
  assert.equal(result.status, 200, result.text);
  assert.equal(result.body?.success, true, result.text);
  assert.equal(result.body?.data?.amount, BASE_TOTAL_TWD - 500);
  assert.notEqual(result.body?.data?.amount, 1);
  assert.notEqual(result.body?.data?.amount, 2);
  assert.notEqual(result.body?.data?.amount, 3);

  const state = await readState();
  assert.equal(state.orders.length, 1);
  assert.equal(state.bookings.length, 1);
  assert.equal(state.redeemLedger.length, 1);
  assert.equal(Number(state.orders[0].total_twd), BASE_TOTAL_TWD - 500);
  assert.equal(Number(state.orders[0].discount_amount), 500);
  assert.deepEqual(state.redeemLedger[0], { user_id: TRAVELER_ID, order_id: state.orders[0].id, delta: -500, reason: 'redeem_order' });
  const discount = state.items.find((item) => item.item_type === 'discount');
  assert.deepEqual(discount, {
    order_id: state.orders[0].id,
    item_type: 'discount',
    title: '點數折抵',
    quantity: 1,
    unit_price: -500,
    subtotal_amount: -500,
    metadata: { kind: 'points_redemption', requestedPoints: 500, redeemedPoints: 500 },
  });
  assert.equal(state.items.reduce((sum, item) => sum + Number(item.subtotal_amount), 0), Number(state.orders[0].total_twd));
});

test('#1813 insufficient, expired or cap-exceeded points are visible input errors with no order, redemption or payment result', async () => {
  const traveler = await loginTraveler();
  for (const { name, seed, redeemPoints } of [
    { name: 'insufficient', seed: "INSERT INTO public.user_points_ledger(user_id, delta, reason, expires_at) VALUES ($1, 100, 'adjust', NULL)", redeemPoints: 500 },
    { name: 'expired', seed: "INSERT INTO public.user_points_ledger(user_id, delta, reason, expires_at) VALUES ($1, 1000, 'earn_order', '2020-01-01T00:00:00.000Z')", redeemPoints: 500 },
    { name: 'cap-exceeded', seed: "INSERT INTO public.user_points_ledger(user_id, delta, reason, expires_at) VALUES ($1, 10000, 'adjust', NULL)", redeemPoints: 3000 },
  ]) {
    await client.query(seed, [TRAVELER_ID]);
    const result = await callPublic(traveler, { contactEmail: `issue1813-${name}@example.invalid`, redeemPoints });
    assert.equal(result.status, 400, `${name}: ${result.text}`);
    assert.deepEqual(result.body, {
      success: false,
      error: { code: 'POINTS_UNAVAILABLE', message: '點數目前無法使用，請重新確認後再試' },
    });
    assert.doesNotMatch(result.text, /bookingId|orderId|checkoutUrl|paymentUrl/iu);
    assertNoMaterialization(await readState(), `${name}: points error must not materialize any order data`);
    await client.query('DELETE FROM public.user_points_ledger WHERE user_id = $1', [TRAVELER_ID]);
  }
});

test('#1813 ignores a forged travelerId and cannot redeem another traveler ledger', async () => {
  await client.query("INSERT INTO public.user_points_ledger(user_id, delta, reason, expires_at) VALUES ($1, 1000, 'adjust', NULL)", [OTHER_TRAVELER_ID]);
  const traveler = await loginTraveler();
  const result = await callPublic(traveler, {
    travelerId: OTHER_TRAVELER_ID,
    contactEmail: 'issue1813-non-owner@example.invalid',
  });
  assert.equal(result.status, 400, result.text);
  assert.deepEqual(result.body, {
    success: false,
    error: { code: 'POINTS_UNAVAILABLE', message: '點數目前無法使用，請重新確認後再試' },
  });
  assert.doesNotMatch(result.text, /bookingId|orderId|checkoutUrl|paymentUrl/iu);
  assertNoMaterialization(await readState(), 'non-owner points must not materialize any order data');
});

test('#1813 ledger, discount-item and final-total failures each roll back the whole public aggregate', async () => {
  const traveler = await loginTraveler();
  const faults = [
    { name: 'ledger', table: 'user_points_ledger', operation: 'INSERT', marker: 'ISSUE1813_LEDGER_BOOM' },
    { name: 'discount_item', table: 'order_items', operation: 'INSERT', when: "WHEN (NEW.item_type = 'discount')", marker: 'ISSUE1813_DISCOUNT_ITEM_BOOM' },
    { name: 'total', table: 'orders', operation: 'UPDATE', when: 'WHEN (NEW.discount_amount IS DISTINCT FROM OLD.discount_amount)', marker: 'ISSUE1813_TOTAL_BOOM' },
  ];
  for (const fault of faults) {
    await client.query("INSERT INTO public.user_points_ledger(user_id, delta, reason, expires_at) VALUES ($1, 1000, 'adjust', NULL)", [TRAVELER_ID]);
    await installFault(fault);
    let result;
    try { result = await callPublic(traveler, { contactEmail: `issue1813-${fault.name}@example.invalid` }); }
    finally { await clearFaults(); }
    assert.equal(result.status, 500, `${fault.name}: ${result.text}`);
    assert.deepEqual(result.body, { success: false, error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' } });
    assert.doesNotMatch(result.text, /bookingId|orderId|checkoutUrl|paymentUrl/iu);
    assertNoMaterialization(await readState(), `${fault.name}: transaction failure must roll back booking, order, item and redemption ledger`);
    await client.query('DELETE FROM public.user_points_ledger WHERE user_id = $1', [TRAVELER_ID]);
  }
});

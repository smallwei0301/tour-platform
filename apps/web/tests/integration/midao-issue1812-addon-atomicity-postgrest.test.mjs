import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import pg from 'pg';

const GUIDE_ID = '18120000-0000-4000-8000-000000000001';
const ACTIVITY_ID = '18120000-0000-4000-8000-000000000002';
const PLAN_ID = '18120000-0000-4000-8000-000000000003';
const SCHEDULE_ID = '18120000-0000-4000-8000-000000000004';
const MEAL_ADDON_ID = '18120000-0000-4000-8000-000000000005';
const INACTIVE_ADDON_ID = '18120000-0000-4000-8000-000000000006';
const LOW_STOCK_ADDON_ID = '18120000-0000-4000-8000-000000000007';
const START_AT = '2027-01-16T02:00:00.000Z';
const END_AT = '2027-01-16T04:00:00.000Z';
const PAYMENT_DEADLINE_AT = '2027-01-17T02:00:00.000Z';
const BASE_TOTAL_TWD = 7_400;
const ADDON_TOTAL_TWD = 400;
const PAYABLE_TOTAL_TWD = BASE_TOTAL_TWD + ADDON_TOTAL_TWD;
const FUNCTION_SIGNATURE = [
  'public.fn_create_booking_draft_with_addons_atomic(',
  'uuid,uuid,timestamptz,timestamptz,text,integer,text,text,text,text,text,uuid,jsonb,text,timestamptz,jsonb',
  ')',
].join('');
const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const apiUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const port = 43_129;
const publicBase = `http://127.0.0.1:${port}`;
const externalEffectEnv = Object.freeze({
  RESEND_API_KEY: '', SENTRY_DSN: '', NEXT_PUBLIC_SENTRY_DSN: '', SENTRY_AUTH_TOKEN: '',
  LINE_MESSAGING_ENABLED: 'false', LINE_PUSH_ENABLED: 'false', LINE_GUIDE_PUSH_ENABLED: 'false',
  LINE_CHANNEL_ACCESS_TOKEN: '', LINE_CHANNEL_SECRET: '', LINE_OPS_GROUP_ID: '',
  TELEGRAM_NOTIFY_ENABLED: 'false', TELEGRAM_GUIDE_NOTIFY_ENABLED: 'false',
  TELEGRAM_TRAVELER_NOTIFY_ENABLED: 'false', TELEGRAM_BOT_TOKEN: '', TELEGRAM_WEBHOOK_SECRET: '',
  TELEGRAM_BOT_USERNAME: '', TELEGRAM_ORDER_CHAT_ID: '', TELEGRAM_ALERT_BOT_TOKEN: '', TELEGRAM_ALERT_CHAT_ID: '',
  ECPAY_ENV: 'stage', ECPAY_MERCHANT_ID: '', ECPAY_HASH_KEY: '', ECPAY_HASH_IV: '',
});

assert.ok(databaseUrl && apiUrl && serviceRoleKey && anonKey, 'issue #1812 needs the isolated PostgREST runtime');
assert.equal(new URL(databaseUrl).hostname, '127.0.0.1', 'integration DB must remain loopback-only');
assert.equal(new URL(apiUrl).hostname, '127.0.0.1', 'integration API must remain loopback-only');

let client;
let webServer;
let webLogs = '';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const headersFor = (key) => ({ apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' });

async function postgrest(route, body, key = serviceRoleKey) {
  const response = await fetch(new URL(route, apiUrl), {
    method: 'POST', headers: headersFor(key), body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload, text };
}

function rpcPayload(overrides = {}) {
  return {
    p_traveler_id: null, p_activity_plan_id: PLAN_ID, p_start_at: START_AT, p_end_at: END_AT,
    p_timezone: 'Asia/Taipei', p_participants: 2, p_source_channel: 'web',
    p_contact_name: 'Issue 1812 Traveler', p_contact_phone: '0900001812',
    p_contact_email: 'issue1812-rpc@example.invalid', p_customer_note: null,
    p_conflict_override_id: null, p_conflict_override_snapshot: null,
    p_correlation_id: 'issue1812-rpc', p_payment_deadline_at: PAYMENT_DEADLINE_AT,
    p_addon_selections: [{ addonId: MEAL_ADDON_ID, quantity: 1, priceTwd: 1 }],
    ...overrides,
  };
}

function publicPayload(overrides = {}) {
  return {
    activityId: ACTIVITY_ID, planId: PLAN_ID, scheduleId: SCHEDULE_ID, startAt: START_AT,
    timezone: 'Asia/Taipei', participants: 2, sourceChannel: 'web',
    contactName: 'Issue 1812 Traveler', contactPhone: '0900001812',
    contactEmail: 'issue1812-public@example.invalid', customerNote: 'isolated integration fixture',
    totalAmount: 1, totalTwd: 2, amount: 3,
    addonSelections: [{ addonId: MEAL_ADDON_ID, quantity: 1, priceTwd: 1, subtotal: 1 }],
    ...overrides,
  };
}

async function callPublic(overrides = {}) {
  const response = await fetch(`${publicBase}/api/v2/bookings/draft`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-correlation-id': 'issue1812-public' },
    body: JSON.stringify(publicPayload(overrides)),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload, text };
}

async function readState() {
  const orders = await client.query('SELECT * FROM public.orders WHERE activity_id = $1 ORDER BY created_at', [ACTIVITY_ID]);
  const orderIds = orders.rows.map((row) => row.id);
  const bookings = await client.query('SELECT * FROM public.bookings WHERE activity_id = $1 ORDER BY created_at', [ACTIVITY_ID]);
  const items = await client.query('SELECT * FROM public.order_items WHERE order_id = ANY($1::uuid[]) ORDER BY created_at', [orderIds]);
  const addons = await client.query('SELECT * FROM public.order_addons WHERE order_id = ANY($1::uuid[]) ORDER BY created_at', [orderIds]);
  const logs = await client.query('SELECT * FROM public.booking_status_logs WHERE booking_id = ANY($1::uuid[]) ORDER BY created_at', [bookings.rows.map((row) => row.id)]);
  return { bookings: bookings.rows, orders: orders.rows, items: items.rows, addons: addons.rows, logs: logs.rows };
}

function assertEmpty(state, context) {
  assert.deepEqual(
    Object.fromEntries(Object.entries(state).map(([key, rows]) => [key, rows.length])),
    { bookings: 0, orders: 0, items: 0, addons: 0, logs: 0 },
    context,
  );
}

async function cleanupMaterialization() {
  const state = await readState();
  const orderIds = state.orders.map((row) => row.id);
  const bookingIds = state.bookings.map((row) => row.id);
  await client.query('DELETE FROM public.order_addons WHERE order_id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.order_items WHERE order_id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.booking_status_logs WHERE booking_id = ANY($1::uuid[])', [bookingIds]);
  await client.query('UPDATE public.bookings SET order_id = NULL WHERE id = ANY($1::uuid[])', [bookingIds]);
  await client.query('UPDATE public.orders SET booking_id = NULL WHERE id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.bookings WHERE id = ANY($1::uuid[])', [bookingIds]);
  await client.query('DELETE FROM public.orders WHERE id = ANY($1::uuid[])', [orderIds]);
}

async function clearFaults() {
  for (const name of ['snapshot', 'addon_item', 'total']) {
    await client.query(`DROP TRIGGER IF EXISTS midao_issue1812_${name}_boom ON public.${name === 'snapshot' ? 'order_addons' : name === 'addon_item' ? 'order_items' : 'orders'}`);
    await client.query(`DROP FUNCTION IF EXISTS public.midao_issue1812_${name}_boom()`);
  }
}

async function installFault({ name, table, operation, when, marker }) {
  await client.query(`
    CREATE FUNCTION public.midao_issue1812_${name}_boom() RETURNS trigger LANGUAGE plpgsql AS $fault$
    BEGIN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '${marker}'; END; $fault$;
    CREATE TRIGGER midao_issue1812_${name}_boom BEFORE ${operation} ON public.${table}
      FOR EACH ROW ${when ?? ''} EXECUTE FUNCTION public.midao_issue1812_${name}_boom();
  `);
}

async function startServer() {
  const env = {
    ...process.env, PORT: String(port), NODE_ENV: 'development', VERCEL_ENV: 'preview',
    NEXT_PUBLIC_BASE_URL: publicBase, NEXT_PUBLIC_APP_URL: publicBase,
    SUPABASE_URL: apiUrl, NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    SUPABASE_ANON_KEY: anonKey, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    GUIDE_SESSION_SECRET: randomBytes(32).toString('hex'), ADMIN_ACCESS_TOKEN: randomBytes(32).toString('hex'),
    ADMIN_EMAIL_ALLOWLIST: 'admin@example.invalid', ADMIN_EMAIL: 'admin@example.invalid', NEXT_TELEMETRY_DISABLED: '1',
    ...externalEffectEnv,
  };
  webServer = spawn(path.join(repoRoot, 'node_modules/.bin/next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: path.join(repoRoot, 'apps/web'), env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const capture = (chunk) => { webLogs = `${webLogs}${String(chunk)}`.slice(-200_000); };
  webServer.stdout.on('data', capture); webServer.stderr.on('data', capture);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (webServer.exitCode !== null) throw new Error(`Next exited early: ${webLogs.slice(-4000)}`);
    try { if ((await fetch(`${publicBase}/images/placeholder-avatar.svg`)).ok) return; } catch {}
    await delay(250);
  }
  throw new Error(`Next readiness timeout: ${webLogs.slice(-4000)}`);
}

async function stopServer() {
  if (!webServer || webServer.exitCode !== null) return;
  const exited = new Promise((resolve) => webServer.once('exit', resolve));
  webServer.kill('SIGTERM');
  await Promise.race([exited, delay(10_000)]);
}

before(async () => {
  client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await clearFaults();
  await client.query('BEGIN');
  try {
    await client.query(`INSERT INTO public.guide_profiles(id, slug, display_name, verification_status)
      VALUES ($1, 'issue1812-guide', 'Issue 1812 Guide', 'approved')`, [GUIDE_ID]);
    await client.query(`INSERT INTO public.activities(id, guide_id, guide_slug, title, slug, status)
      VALUES ($1, $2, 'issue1812-guide', 'Issue 1812 Atomic Tour', 'issue1812-atomic-tour', 'published')`, [ACTIVITY_ID, GUIDE_ID]);
    await client.query(`INSERT INTO public.activity_plans(id, activity_id, name, slug, duration_minutes, price_type, base_price, min_participants, max_participants, booking_type, status, is_year_round)
      VALUES ($1, $2, 'Issue 1812 Plan', 'issue1812-plan', 120, 'per_person', 3700, 1, 8, 'scheduled', 'active', false)`, [PLAN_ID, ACTIVITY_ID]);
    await client.query(`INSERT INTO public.activity_schedules(id, activity_id, plan_id, start_at, end_at, capacity, booked_count, status)
      VALUES ($1, $2, $3, $4, $5, 8, 0, 'open')`, [SCHEDULE_ID, ACTIVITY_ID, PLAN_ID, START_AT, END_AT]);
    await client.query(`INSERT INTO public.activity_addons(id, activity_id, name, price_twd, unit, stock, is_active, sort_order) VALUES
      ($1, $4, '午餐', 200, 'per_person', NULL, true, 1),
      ($2, $4, '停售接送', 300, 'per_group', NULL, false, 2),
      ($3, $4, '限量裝備', 500, 'per_group', 1, true, 3)`, [MEAL_ADDON_ID, INACTIVE_ADDON_ID, LOW_STOCK_ADDON_ID, ACTIVITY_ID]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  await startServer();
});

beforeEach(async () => { await clearFaults(); await cleanupMaterialization(); });
after(async () => {
  try { await stopServer(); await clearFaults(); await cleanupMaterialization();
    await client.query('DELETE FROM public.activity_schedules WHERE id = $1', [SCHEDULE_ID]);
    await client.query('DELETE FROM public.activity_addons WHERE activity_id = $1', [ACTIVITY_ID]);
    await client.query('DELETE FROM public.activity_plans WHERE id = $1', [PLAN_ID]);
    await client.query('DELETE FROM public.activities WHERE id = $1', [ACTIVITY_ID]);
    await client.query('DELETE FROM public.guide_profiles WHERE id = $1', [GUIDE_ID]);
  } finally { await client.end(); }
});

test('#1812 runtime exposes a service-role-only add-on atomic RPC', async () => {
  const catalog = await client.query(`SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure($1)`, [FUNCTION_SIGNATURE]);
  assert.equal(catalog.rowCount, 1, `RED: missing ${FUNCTION_SIGNATURE}`);
  assert.equal(catalog.rows[0].prosecdef, false);
  const denied = await postgrest('/rest/v1/rpc/fn_create_booking_draft_with_addons_atomic', rpcPayload(), anonKey);
  assert.ok([401, 403, 404].includes(denied.response.status), denied.text);
  assertEmpty(await readState(), 'anon must not materialize an add-on order');
});

test('#1812 public draft ignores client money and commits reconciled add-on snapshots, items and payable total', async () => {
  const created = await callPublic();
  assert.equal(created.response.status, 200, created.text);
  assert.equal(created.payload?.success, true, created.text);
  assert.equal(created.payload?.data?.amount, PAYABLE_TOTAL_TWD);
  assert.notEqual(created.payload?.data?.amount, 1);
  assert.notEqual(created.payload?.data?.amount, 2);
  assert.notEqual(created.payload?.data?.amount, 3);
  const state = await readState();
  assert.deepEqual(Object.fromEntries(Object.entries(state).map(([key, rows]) => [key, rows.length])), { bookings: 1, orders: 1, items: 2, addons: 1, logs: 1 });
  assert.equal(Number(state.orders[0].total_twd), PAYABLE_TOTAL_TWD);
  assert.equal(state.addons[0].addon_id, MEAL_ADDON_ID);
  assert.equal(Number(state.addons[0].quantity), 1);
  assert.equal(Number(state.addons[0].unit_price_twd), 200);
  assert.equal(Number(state.addons[0].subtotal_twd), ADDON_TOTAL_TWD);
  const addonItem = state.items.find((item) => item.item_type === 'fee');
  assert.ok(addonItem);
  assert.equal(addonItem.ref_id, MEAL_ADDON_ID);
  assert.equal(Number(addonItem.quantity), 2);
  assert.equal(Number(addonItem.unit_price), 200);
  assert.equal(Number(addonItem.subtotal_amount), ADDON_TOTAL_TWD);
  assert.deepEqual(addonItem.metadata, { kind: 'addon', addonId: MEAL_ADDON_ID, selectedQuantity: 1, unit: 'per_person' });
  assert.equal(state.items.reduce((sum, item) => sum + Number(item.subtotal_amount), 0), PAYABLE_TOTAL_TWD);
});

test('#1812 inactive and insufficient-stock selections are visible input errors with no materialization or success notification', async () => {
  for (const [addonId, selections, code] of [
    [INACTIVE_ADDON_ID, [{ addonId: INACTIVE_ADDON_ID, quantity: 1 }], 'ADDON_UNAVAILABLE'],
    [LOW_STOCK_ADDON_ID, [{ addonId: LOW_STOCK_ADDON_ID, quantity: 2 }], 'ADDON_UNAVAILABLE'],
    [LOW_STOCK_ADDON_ID, [{ addonId: LOW_STOCK_ADDON_ID, quantity: 1 }, { addonId: LOW_STOCK_ADDON_ID, quantity: 1 }], 'VALIDATION_ERROR'],
  ]) {
    const logStart = webLogs.length;
    const failed = await callPublic({ contactEmail: `issue1812-invalid-${selections.length}@example.invalid`, addonSelections: selections });
    assert.equal(failed.response.status, 400, failed.text);
    assert.deepEqual(failed.payload, {
      success: false,
      error: {
        code,
        message: code === 'ADDON_UNAVAILABLE' ? '所選加購目前無法使用，請重新選擇' : '加購選擇格式不正確，請重新選擇',
        details: { addonId },
      },
    });
    assert.doesNotMatch(failed.text, /bookingId|orderId|checkoutUrl|paymentUrl/iu);
    assertEmpty(await readState(), 'unavailable add-on must not leave any booking/order data');
    await delay(200);
    assert.doesNotMatch(webLogs.slice(logStart), /booking-draft-post-create-notify/iu, 'invalid input must not reach notification');
  }
});

test('#1812 selection count above the legacy 20-item limit is rejected before any materialization', async () => {
  const failed = await callPublic({
    contactEmail: 'issue1812-selection-limit@example.invalid',
    addonSelections: Array.from({ length: 21 }, () => ({ addonId: MEAL_ADDON_ID, quantity: 1 })),
  });
  assert.equal(failed.response.status, 400, failed.text);
  assert.deepEqual(failed.payload, {
    success: false,
    error: { code: 'VALIDATION_ERROR', message: '加購選擇格式不正確，請重新選擇' },
  });
  assertEmpty(await readState(), 'too many selections must not materialize any booking/order data');
});

test('#1812 snapshot, add-on item and final total faults each roll back the whole public aggregate', async () => {
  const faults = [
    { name: 'snapshot', table: 'order_addons', operation: 'INSERT', marker: 'ISSUE1812_SNAPSHOT_BOOM' },
    { name: 'addon_item', table: 'order_items', operation: 'INSERT', when: "WHEN (NEW.item_type = 'fee')", marker: 'ISSUE1812_ADDON_ITEM_BOOM' },
    { name: 'total', table: 'orders', operation: 'UPDATE', when: 'WHEN (NEW.total_twd IS DISTINCT FROM OLD.total_twd)', marker: 'ISSUE1812_TOTAL_BOOM' },
  ];
  for (const fault of faults) {
    await installFault(fault);
    let failed;
    try { failed = await callPublic({ contactEmail: `issue1812-${fault.name}@example.invalid` }); }
    finally { await clearFaults(); }
    assert.equal(failed.response.status, 500, `${fault.name}: ${failed.text}`);
    assert.deepEqual(failed.payload, { success: false, error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' } });
    assert.doesNotMatch(failed.text, /bookingId|orderId|checkoutUrl|paymentUrl/iu);
    assertEmpty(await readState(), `${fault.name}: required add-on write must roll back every row`);
  }
});

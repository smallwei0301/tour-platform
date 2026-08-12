import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import pg from 'pg';

const GUIDE_ID = '18130000-0000-4000-8000-000000000001';
const ACTIVITY_ID = '18130000-0000-4000-8000-000000000002';
const PLAN_ID = '18130000-0000-4000-8000-000000000003';
const SCHEDULE_ID = '18130000-0000-4000-8000-000000000004';
const START_AT = '2027-01-17T02:00:00.000Z';
const END_AT = '2027-01-17T04:00:00.000Z';
const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const API_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const PORT = 43_130;
const PUBLIC_BASE = `http://127.0.0.1:${PORT}`;

assert.ok(DATABASE_URL && API_URL && SERVICE_ROLE_KEY && ANON_KEY, 'issue #1813 needs the isolated PostgREST runtime');
assert.equal(new URL(DATABASE_URL).hostname, '127.0.0.1', 'integration DB must remain loopback-only');
assert.equal(new URL(API_URL).hostname, '127.0.0.1', 'integration API must remain loopback-only');

let client;
let webServer;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    contactEmail: 'issue1813-public@example.invalid',
    redeemPoints: 300,
    totalAmount: 1,
    totalTwd: 2,
    amount: 3,
    ...overrides,
  };
}

async function callPublic(overrides = {}) {
  const response = await fetch(`${PUBLIC_BASE}/api/v2/bookings/draft`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-correlation-id': 'issue1813-public' },
    body: JSON.stringify(publicPayload(overrides)),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload, text };
}

async function readState() {
  const orders = await client.query('SELECT id FROM public.orders WHERE activity_id = $1', [ACTIVITY_ID]);
  const bookings = await client.query('SELECT id FROM public.bookings WHERE activity_id = $1', [ACTIVITY_ID]);
  const items = await client.query('SELECT id FROM public.order_items WHERE order_id = ANY($1::uuid[])', [orders.rows.map((row) => row.id)]);
  const ledger = await client.query("SELECT id FROM public.user_points_ledger WHERE reason = 'redeem_order' AND order_id = ANY($1::uuid[])", [orders.rows.map((row) => row.id)]);
  return { orders: orders.rows, bookings: bookings.rows, items: items.rows, ledger: ledger.rows };
}

function assertEmpty(state, label) {
  assert.deepEqual(
    Object.fromEntries(Object.entries(state).map(([key, rows]) => [key, rows.length])),
    { orders: 0, bookings: 0, items: 0, ledger: 0 },
    label,
  );
}

async function cleanup() {
  const state = await readState();
  const orderIds = state.orders.map((row) => row.id);
  const bookingIds = state.bookings.map((row) => row.id);
  await client.query('DELETE FROM public.order_items WHERE order_id = ANY($1::uuid[])', [orderIds]);
  await client.query('UPDATE public.bookings SET order_id = NULL WHERE id = ANY($1::uuid[])', [bookingIds]);
  await client.query('UPDATE public.orders SET booking_id = NULL WHERE id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.bookings WHERE id = ANY($1::uuid[])', [bookingIds]);
  await client.query('DELETE FROM public.orders WHERE id = ANY($1::uuid[])', [orderIds]);
}

async function startServer() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'development',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_BASE_URL: PUBLIC_BASE,
    NEXT_PUBLIC_APP_URL: PUBLIC_BASE,
    SUPABASE_URL: API_URL,
    NEXT_PUBLIC_SUPABASE_URL: API_URL,
    SUPABASE_ANON_KEY: ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    GUIDE_SESSION_SECRET: randomBytes(32).toString('hex'),
    ADMIN_ACCESS_TOKEN: randomBytes(32).toString('hex'),
    ADMIN_EMAIL_ALLOWLIST: 'admin@example.invalid',
    ADMIN_EMAIL: 'admin@example.invalid',
    NEXT_TELEMETRY_DISABLED: '1',
    RESEND_API_KEY: '',
    SENTRY_DSN: '',
    NEXT_PUBLIC_SENTRY_DSN: '',
    SENTRY_AUTH_TOKEN: '',
    LINE_MESSAGING_ENABLED: 'false',
    LINE_PUSH_ENABLED: 'false',
    LINE_GUIDE_PUSH_ENABLED: 'false',
    TELEGRAM_NOTIFY_ENABLED: 'false',
    TELEGRAM_GUIDE_NOTIFY_ENABLED: 'false',
    TELEGRAM_TRAVELER_NOTIFY_ENABLED: 'false',
    ECPAY_ENV: 'stage',
    ECPAY_MERCHANT_ID: '',
    ECPAY_HASH_KEY: '',
    ECPAY_HASH_IV: '',
  };
  webServer = spawn(path.join(REPO_ROOT, 'node_modules/.bin/next'), ['dev', '--hostname', '127.0.0.1', '--port', String(PORT)], {
    cwd: path.join(REPO_ROOT, 'apps/web'), env, stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (webServer.exitCode !== null) throw new Error(`Next exited early: ${webServer.exitCode}`);
    try { if ((await fetch(`${PUBLIC_BASE}/images/placeholder-avatar.svg`)).ok) return; } catch {}
    await delay(250);
  }
  throw new Error('Next readiness timeout');
}

async function stopServer() {
  if (!webServer || webServer.exitCode !== null) return;
  const exited = new Promise((resolve) => webServer.once('exit', resolve));
  webServer.kill('SIGTERM');
  await Promise.race([exited, delay(10_000)]);
}

before(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(`INSERT INTO public.guide_profiles(id, slug, display_name, verification_status)
    VALUES ($1, 'issue1813-guide', 'Issue 1813 Guide', 'approved')`, [GUIDE_ID]);
  await client.query(`INSERT INTO public.activities(id, guide_id, guide_slug, title, slug, status)
    VALUES ($1, $2, 'issue1813-guide', 'Issue 1813 Atomic Tour', 'issue1813-atomic-tour', 'published')`, [ACTIVITY_ID, GUIDE_ID]);
  await client.query(`INSERT INTO public.activity_plans(id, activity_id, name, slug, duration_minutes, price_type, base_price, min_participants, max_participants, booking_type, status, is_year_round)
    VALUES ($1, $2, 'Issue 1813 Plan', 'issue1813-plan', 120, 'per_person', 3700, 1, 8, 'scheduled', 'active', false)`, [PLAN_ID, ACTIVITY_ID]);
  await client.query(`INSERT INTO public.activity_schedules(id, activity_id, plan_id, start_at, end_at, capacity, booked_count, status)
    VALUES ($1, $2, $3, $4, $5, 8, 0, 'open')`, [SCHEDULE_ID, ACTIVITY_ID, PLAN_ID, START_AT, END_AT]);
  await startServer();
});

beforeEach(async () => { await cleanup(); });
after(async () => {
  try {
    await stopServer();
    await cleanup();
    await client.query('DELETE FROM public.activity_schedules WHERE id = $1', [SCHEDULE_ID]);
    await client.query('DELETE FROM public.activity_plans WHERE id = $1', [PLAN_ID]);
    await client.query('DELETE FROM public.activities WHERE id = $1', [ACTIVITY_ID]);
    await client.query('DELETE FROM public.guide_profiles WHERE id = $1', [GUIDE_ID]);
  } finally {
    await client.end();
  }
});

test('#1813 RED: anonymous points redemption is rejected instead of silently creating a full-price draft', async () => {
  const result = await callPublic();
  assert.equal(result.response.status, 400, result.text);
  assert.deepEqual(result.payload, {
    success: false,
    error: { code: 'POINTS_UNAVAILABLE', message: '點數目前無法使用，請重新確認後再試' },
  });
  assert.doesNotMatch(result.text, /bookingId|orderId|checkoutUrl|paymentUrl/iu);
  assertEmpty(await readState(), 'anonymous points request must not materialize a full-price order');
});

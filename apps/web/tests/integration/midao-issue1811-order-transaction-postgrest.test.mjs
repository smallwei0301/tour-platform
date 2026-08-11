import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import pg from 'pg';

const GUIDE_ID = '18110000-0000-4000-8000-000000000001';
const ACTIVITY_ID = '18110000-0000-4000-8000-000000000002';
const PLAN_ID = '18110000-0000-4000-8000-000000000003';
const SCHEDULE_ID = '18110000-0000-4000-8000-000000000004';
const TRAVELER_ID = '18110000-0000-4000-8000-000000000005';
const START_AT = '2027-01-15T02:00:00.000Z';
const END_AT = '2027-01-15T04:00:00.000Z';
const PAYMENT_DEADLINE_AT = '2027-01-16T02:00:00.000Z';
const CONTACT_EMAIL = 'issue1811-atomic@example.invalid';
const BASE_TOTAL_TWD = 7_400;
const CANCEL_LOCK_CLASS = 1_811;
const CANCEL_LOCK_OBJECT = 18_110_001;
const PUBLIC_RED_PROBE_ONLY = process.env.ISSUE1811_PUBLIC_RED_PROBE === '1';
const PUBLIC_RED_MARKER = 'ISSUE1811_PUBLIC_REQUIRED_WRITE_FAULT_RED';
const PUBLIC_FAULT_REACHED_MARKER = 'ISSUE1811_PUBLIC_REQUIRED_WRITE_FAULT_REACHED';
const PUBLIC_FAULT_RESULT_MARKER = 'ISSUE1811_PUBLIC_REQUIRED_WRITE_FAULT_RESULT';
const FUNCTION_SIGNATURE = [
  'public.fn_create_booking_draft_atomic(',
  'uuid,uuid,timestamptz,timestamptz,text,integer,text,text,text,text,text,uuid,jsonb,text,timestamptz',
  ')',
].join('');
const IDENTITY_ARGUMENTS = [
  'p_traveler_id uuid',
  'p_activity_plan_id uuid',
  'p_start_at timestamp with time zone',
  'p_end_at timestamp with time zone',
  'p_timezone text',
  'p_participants integer',
  'p_source_channel text',
  'p_contact_name text',
  'p_contact_phone text',
  'p_contact_email text',
  'p_customer_note text',
  'p_conflict_override_id uuid',
  'p_conflict_override_snapshot jsonb',
  'p_correlation_id text',
  'p_payment_deadline_at timestamp with time zone',
].join(', ');
const FAULT_CASES = [
  { name: 'orders_insert', table: 'orders', operation: 'INSERT', marker: 'ISSUE1811_ORDERS_INSERT_BOOM' },
  { name: 'bookings_insert', table: 'bookings', operation: 'INSERT', marker: 'ISSUE1811_BOOKINGS_INSERT_BOOM' },
  { name: 'orders_link', table: 'orders', operation: 'UPDATE', marker: 'ISSUE1811_ORDERS_LINK_BOOM' },
  { name: 'order_items_insert', table: 'order_items', operation: 'INSERT', marker: 'ISSUE1811_ORDER_ITEMS_BOOM' },
  { name: 'status_log_insert', table: 'booking_status_logs', operation: 'INSERT', marker: 'ISSUE1811_STATUS_LOG_BOOM' },
];
const EXTERNAL_EFFECT_ENV_OVERRIDES = Object.freeze({
  RESEND_API_KEY: '',
  SENTRY_DSN: '',
  NEXT_PUBLIC_SENTRY_DSN: '',
  SENTRY_AUTH_TOKEN: '',
  LINE_MESSAGING_ENABLED: 'false',
  LINE_PUSH_ENABLED: 'false',
  LINE_GUIDE_PUSH_ENABLED: 'false',
  LINE_CHANNEL_ACCESS_TOKEN: '',
  LINE_CHANNEL_SECRET: '',
  LINE_OPS_GROUP_ID: '',
  TELEGRAM_NOTIFY_ENABLED: 'false',
  TELEGRAM_GUIDE_NOTIFY_ENABLED: 'false',
  TELEGRAM_TRAVELER_NOTIFY_ENABLED: 'false',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_WEBHOOK_SECRET: '',
  TELEGRAM_BOT_USERNAME: '',
  TELEGRAM_ORDER_CHAT_ID: '',
  TELEGRAM_ALERT_BOT_TOKEN: '',
  TELEGRAM_ALERT_CHAT_ID: '',
  ECPAY_ENV: 'stage',
  ECPAY_MERCHANT_ID: '',
  ECPAY_HASH_KEY: '',
  ECPAY_HASH_IV: '',
});

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const apiUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const publicRoutePort = 43_128;
const publicRouteBase = `http://127.0.0.1:${publicRoutePort}`;

function fullRuntimeTest(name, fn) {
  return PUBLIC_RED_PROBE_ONLY ? test.skip(name, fn) : test(name, fn);
}

assert.ok(databaseUrl, 'issue #1811 PostgREST runner must provide a local database URL');
assert.ok(apiUrl && serviceRoleKey && anonKey, 'issue #1811 runner must provide local API credentials');
const parsedDatabaseUrl = new URL(databaseUrl);
assert.equal(parsedDatabaseUrl.protocol, 'postgresql:');
assert.equal(parsedDatabaseUrl.hostname, '127.0.0.1', 'issue #1811 integration must remain on exact loopback');
assert.equal(parsedDatabaseUrl.port, '54322');
assert.equal(parsedDatabaseUrl.pathname, '/postgres');
assert.equal(parsedDatabaseUrl.search, '');
assert.equal(parsedDatabaseUrl.hash, '');
const parsedApiUrl = new URL(apiUrl);
assert.equal(parsedApiUrl.protocol, 'http:');
assert.equal(parsedApiUrl.hostname, '127.0.0.1', 'issue #1811 PostgREST proxy must remain on loopback');
assert.match(parsedApiUrl.port, /^\d{4,5}$/u);
assert.equal(parsedApiUrl.pathname, '/');
assert.equal(parsedApiUrl.search, '');
assert.equal(parsedApiUrl.hash, '');

let client;
let webServer;
let webServerLogs = '';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureWebServerLog(chunk) {
  webServerLogs = `${webServerLogs}${String(chunk)}`.slice(-200_000);
}

async function waitForWebLog(pattern, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(webServerLogs)) return;
    await delay(100);
  }
  throw new Error(`issue #1811 expected web log was not observed: ${pattern}`);
}

async function startPublicRouteServer() {
  const childEnv = {
    ...process.env,
    PORT: String(publicRoutePort),
    NODE_ENV: 'development',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_BASE_URL: publicRouteBase,
    NEXT_PUBLIC_APP_URL: publicRouteBase,
    SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    GUIDE_SESSION_SECRET: randomBytes(32).toString('hex'),
    ADMIN_ACCESS_TOKEN: randomBytes(32).toString('hex'),
    ADMIN_EMAIL_ALLOWLIST: 'admin@example.invalid',
    ADMIN_EMAIL: 'admin@example.invalid',
    NEXT_TELEMETRY_DISABLED: '1',
    ...EXTERNAL_EFFECT_ENV_OVERRIDES,
  };
  for (const [key, value] of Object.entries(EXTERNAL_EFFECT_ENV_OVERRIDES)) {
    assert.equal(childEnv[key], value, `issue #1811 child server must isolate external effect env ${key}`);
  }
  webServer = spawn(
    path.join(repoRoot, 'node_modules/.bin/next'),
    ['dev', '--hostname', '127.0.0.1', '--port', String(publicRoutePort)],
    { cwd: path.join(repoRoot, 'apps/web'), env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  webServer.stdout.on('data', captureWebServerLog);
  webServer.stderr.on('data', captureWebServerLog);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (webServer.exitCode !== null) {
      throw new Error(`issue #1811 Next server exited early (${webServer.exitCode}): ${webServerLogs.slice(-4_000)}`);
    }
    try {
      const response = await fetch(`${publicRouteBase}/images/placeholder-avatar.svg`);
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`issue #1811 Next server readiness timeout: ${webServerLogs.slice(-4_000)}`);
}

async function stopPublicRouteServer() {
  if (!webServer || webServer.exitCode !== null) return;
  const exited = new Promise((resolve) => webServer.once('exit', resolve));
  webServer.kill('SIGTERM');
  await Promise.race([exited, delay(10_000)]);
  if (webServer.exitCode === null) {
    const killed = new Promise((resolve) => webServer.once('exit', resolve));
    webServer.kill('SIGKILL');
    await Promise.race([killed, delay(5_000)]);
  }
}

function headersFor(key) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
}

async function postgrest(path, { body, key = serviceRoleKey } = {}) {
  const response = await fetch(new URL(path, apiUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers: headersFor(key),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload, text };
}

function atomicDraftPayload(overrides = {}) {
  return {
    p_traveler_id: null,
    p_activity_plan_id: PLAN_ID,
    p_start_at: START_AT,
    p_end_at: END_AT,
    p_timezone: 'Asia/Taipei',
    p_participants: 2,
    p_source_channel: 'web',
    p_contact_name: 'Issue 1811 Traveler',
    p_contact_phone: '0900001811',
    p_contact_email: CONTACT_EMAIL,
    p_customer_note: 'Issue 1811 isolated transaction test',
    p_conflict_override_id: null,
    p_conflict_override_snapshot: null,
    p_correlation_id: 'issue1811-runtime-contract',
    p_payment_deadline_at: PAYMENT_DEADLINE_AT,
    ...overrides,
  };
}

async function callAtomicDraft(overrides = {}, key = serviceRoleKey) {
  return postgrest('/rest/v1/rpc/fn_create_booking_draft_atomic', {
    body: atomicDraftPayload(overrides),
    key,
  });
}

function publicDraftPayload(overrides = {}) {
  return {
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    scheduleId: SCHEDULE_ID,
    startAt: START_AT,
    timezone: 'Asia/Taipei',
    participants: 2,
    sourceChannel: 'web',
    contactName: 'Issue 1811 Public Traveler',
    contactPhone: '0900001811',
    contactEmail: CONTACT_EMAIL,
    customerNote: 'Issue 1811 public route transaction tracer',
    totalAmount: 1,
    totalTwd: 2,
    amount: 3,
    ...overrides,
  };
}

async function callPublicDraft(overrides = {}) {
  const response = await fetch(`${publicRouteBase}/api/v2/bookings/draft`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-correlation-id': 'issue1811-public-route' },
    body: JSON.stringify(publicDraftPayload(overrides)),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload, text };
}

async function getRows(path) {
  const result = await postgrest(path);
  assert.equal(result.response.status, 200, result.text);
  assert.ok(Array.isArray(result.payload), result.text);
  return result.payload;
}

function inFilter(ids) {
  return `in.(${ids.join(',')})`;
}

async function readMaterialization() {
  const bookings = await getRows(
    `/rest/v1/bookings?select=id,booking_no,status,order_id,traveler_id,activity_id,activity_plan_id,guide_id,guide_approval_status,participants,timezone,start_at,end_at,customer_note&activity_plan_id=eq.${PLAN_ID}`,
  );
  const orders = await getRows(
    `/rest/v1/orders?select=id,booking_id,user_id,status,payment_status,total_twd,people_count,contact_name,contact_phone,contact_email,activity_id,source_channel,payment_deadline_at&activity_id=eq.${ACTIVITY_ID}`,
  );
  const orderIds = orders.map(({ id }) => id);
  const bookingIds = bookings.map(({ id }) => id);
  const items = orderIds.length === 0
    ? []
    : await getRows(
      `/rest/v1/order_items?select=id,order_id,booking_id,item_type,ref_id,title,quantity,unit_price,subtotal_amount,metadata&order_id=${inFilter(orderIds)}`,
    );
  const statusLogs = bookingIds.length === 0
    ? []
    : await getRows(
      `/rest/v1/booking_status_logs?select=id,booking_id,from_status,to_status,actor_user_id,actor_role,reason,metadata&booking_id=${inFilter(bookingIds)}`,
    );
  return { bookings, orders, items, statusLogs };
}

function assertNoMaterialization(snapshot, label) {
  assert.deepEqual(
    materializationCounts(snapshot),
    { bookings: 0, orders: 0, items: 0, statusLogs: 0 },
    label,
  );
}

function materializationCounts(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).map(([key, rows]) => [key, rows.length]));
}

async function countDraftFaultIncidents(marker) {
  const result = await client.query(`
    SELECT count(*)::integer AS count
      FROM public.incidents
     WHERE source = 'v2/bookings/draft'
       AND message LIKE $1
  `, [`%${marker}%`]);
  return Number(result.rows[0]?.count ?? 0);
}

async function waitForPublicFaultEvidence(marker, logStart, incidentCountBefore) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (webServerLogs.slice(logStart).includes(marker)) return 'web-log';
    if ((await countDraftFaultIncidents(marker)) > incidentCountBefore) return 'local-incident';
    await delay(50);
  }
  return null;
}

async function dropFaultInjection() {
  for (const fault of FAULT_CASES) {
    const functionName = `midao_issue1811_${fault.name}_boom`;
    await client.query(`DROP TRIGGER IF EXISTS ${functionName} ON public.${fault.table}`);
    await client.query(`DROP FUNCTION IF EXISTS public.${functionName}()`);
  }
  await client.query('DROP TRIGGER IF EXISTS midao_issue1811_cancel_block ON public.booking_status_logs');
  await client.query('DROP FUNCTION IF EXISTS public.midao_issue1811_cancel_block()');
}

async function installFaultInjection(fault) {
  const functionName = `midao_issue1811_${fault.name}_boom`;
  await client.query(`
    CREATE FUNCTION public.${functionName}()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fault$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '${fault.marker}';
    END;
    $fault$;

    CREATE TRIGGER ${functionName}
      BEFORE ${fault.operation} ON public.${fault.table}
      FOR EACH ROW EXECUTE FUNCTION public.${functionName}();
  `);
}

async function installCancellationBlock() {
  await client.query(`
    CREATE FUNCTION public.midao_issue1811_cancel_block()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $block$
    BEGIN
      PERFORM pg_catalog.pg_advisory_xact_lock(${CANCEL_LOCK_CLASS}, ${CANCEL_LOCK_OBJECT});
      RETURN NEW;
    END;
    $block$;

    CREATE TRIGGER midao_issue1811_cancel_block
      BEFORE INSERT ON public.booking_status_logs
      FOR EACH ROW EXECUTE FUNCTION public.midao_issue1811_cancel_block();
  `);
}

async function waitForBlockedAtomicBackend() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await client.query(`
      SELECT activity.pid
        FROM pg_catalog.pg_stat_activity AS activity
        JOIN pg_catalog.pg_locks AS waiting_lock ON waiting_lock.pid = activity.pid
       WHERE waiting_lock.locktype = 'advisory'
         AND waiting_lock.granted = false
         AND activity.pid <> pg_catalog.pg_backend_pid()
         AND activity.query LIKE '%fn_create_booking_draft_atomic%'
       ORDER BY activity.pid
       LIMIT 1
    `);
    if (result.rows[0]?.pid) return Number(result.rows[0].pid);
    await delay(50);
  }
  throw new Error('issue #1811 cancellation target did not reach the blocking transaction seam');
}

async function cleanupMaterialization() {
  const bookingResult = await client.query(
    'SELECT id FROM public.bookings WHERE activity_plan_id = $1 OR activity_id = $2',
    [PLAN_ID, ACTIVITY_ID],
  );
  const bookingIds = bookingResult.rows.map(({ id }) => id);
  const orderResult = await client.query(
    `SELECT id FROM public.orders
      WHERE activity_id = $1
         OR contact_email = $2
         OR booking_id = ANY($3::uuid[])`,
    [ACTIVITY_ID, CONTACT_EMAIL, bookingIds],
  );
  const orderIds = orderResult.rows.map(({ id }) => id);

  await client.query(
    'DELETE FROM public.order_items WHERE order_id = ANY($1::uuid[]) OR booking_id = ANY($2::uuid[])',
    [orderIds, bookingIds],
  );
  await client.query('DELETE FROM public.booking_status_logs WHERE booking_id = ANY($1::uuid[])', [bookingIds]);
  await client.query('UPDATE public.bookings SET order_id = NULL WHERE id = ANY($1::uuid[])', [bookingIds]);
  await client.query('UPDATE public.orders SET booking_id = NULL WHERE id = ANY($1::uuid[])', [orderIds]);
  await client.query('DELETE FROM public.bookings WHERE id = ANY($1::uuid[])', [bookingIds]);
  await client.query('DELETE FROM public.orders WHERE id = ANY($1::uuid[])', [orderIds]);
}

async function cleanupFixtures() {
  await dropFaultInjection();
  await cleanupMaterialization();
  await client.query('DELETE FROM public.activity_schedules WHERE id = $1', [SCHEDULE_ID]);
  await client.query('DELETE FROM public.activity_plans WHERE id = $1', [PLAN_ID]);
  await client.query('DELETE FROM public.activities WHERE id = $1', [ACTIVITY_ID]);
  await client.query('DELETE FROM public.guide_profiles WHERE id = $1', [GUIDE_ID]);
  await client.query('DELETE FROM public.users WHERE id = $1', [TRAVELER_ID]);
  await client.query('DELETE FROM auth.users WHERE id = $1', [TRAVELER_ID]);
}

before(async () => {
  client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await cleanupFixtures();
  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
      VALUES (
        $1, 'authenticated', 'authenticated', 'issue1811-traveler@example.invalid',
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"Issue 1811 Traveler","role":"traveler"}'::jsonb
      )
    `, [TRAVELER_ID]);
    // auth.users may already materialize public.users through the hosted baseline trigger.
    await client.query(`
      INSERT INTO public.users(id, role)
      VALUES ($1, 'traveler')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
    `, [TRAVELER_ID]);
    await client.query(`
      INSERT INTO public.guide_profiles(id, slug, display_name, verification_status)
      VALUES ($1, 'issue1811-atomic-guide', 'Issue 1811 Atomic Guide', 'approved')
    `, [GUIDE_ID]);
    await client.query(`
      INSERT INTO public.activities(id, guide_id, guide_slug, title, slug, status)
      VALUES ($1, $2, 'issue1811-atomic-guide', 'Issue 1811 Atomic Tour', 'issue1811-atomic-tour', 'published')
    `, [ACTIVITY_ID, GUIDE_ID]);
    await client.query(`
      INSERT INTO public.activity_plans(
        id, activity_id, name, slug, duration_minutes, price_type, base_price,
        min_participants, max_participants, booking_type, status, is_year_round
      ) VALUES (
        $1, $2, 'Issue 1811 Per-person Plan', 'issue1811-per-person', 120,
        'per_person', 3700, 1, 8, 'scheduled', 'active', false
      )
    `, [PLAN_ID, ACTIVITY_ID]);
    await client.query(`
      INSERT INTO public.activity_schedules(
        id, activity_id, plan_id, start_at, end_at, capacity, booked_count, status
      ) VALUES ($1, $2, $3, $4, $5, 8, 0, 'open')
    `, [SCHEDULE_ID, ACTIVITY_ID, PLAN_ID, START_AT, END_AT]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  await startPublicRouteServer();
});

beforeEach(async () => {
  await dropFaultInjection();
  await cleanupMaterialization();
});

after(async () => {
  if (!client) return;
  try {
    await stopPublicRouteServer();
    await cleanupFixtures();
  } finally { await client.end(); }
});

fullRuntimeTest('runtime catalog exposes the exact authoritative-total RPC as a pinned SECURITY INVOKER function', async () => {
  const catalog = await client.query(`
    SELECT n.nspname AS namespace,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
           pg_catalog.pg_get_function_result(p.oid) AS result,
           p.prosecdef,
           p.proconfig
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
     WHERE p.oid = pg_catalog.to_regprocedure($1)
  `, [FUNCTION_SIGNATURE]);
  assert.equal(
    catalog.rowCount,
    1,
    `RED: missing ${FUNCTION_SIGNATURE}; the atomic draft migration has not materialized the public RPC`,
  );
  assert.deepEqual(catalog.rows[0], {
    namespace: 'public',
    identity_arguments: IDENTITY_ARGUMENTS,
    result: 'jsonb',
    prosecdef: false,
    proconfig: ['search_path=pg_catalog'],
  });
  assert.doesNotMatch(catalog.rows[0].identity_arguments, /total/iu, 'client total must not enter the RPC');
});

fullRuntimeTest('runtime ACL grants the RPC only to service_role and PostgREST rejects anon', async () => {
  const signature = await client.query(
    'SELECT pg_catalog.to_regprocedure($1)::oid AS oid',
    [FUNCTION_SIGNATURE],
  );
  assert.ok(signature.rows[0].oid, `RED: missing ${FUNCTION_SIGNATURE}`);

  const privileges = await client.query(`
    SELECT has_function_privilege('anon', $1::oid, 'EXECUTE') AS anon,
           has_function_privilege('authenticated', $1::oid, 'EXECUTE') AS authenticated,
           has_function_privilege('service_role', $1::oid, 'EXECUTE') AS service_role
  `, [signature.rows[0].oid]);
  assert.deepEqual(privileges.rows[0], {
    anon: false,
    authenticated: false,
    service_role: true,
  });
  const acl = await client.query(`
    SELECT COALESCE(role_row.rolname, 'PUBLIC') AS grantee,
           exploded.privilege_type
      FROM pg_catalog.pg_proc AS function_row
      CROSS JOIN LATERAL pg_catalog.aclexplode(function_row.proacl) AS exploded
      LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = exploded.grantee
     WHERE function_row.oid = $1::oid
       AND COALESCE(role_row.rolname, 'PUBLIC') IN ('PUBLIC', 'anon', 'authenticated')
  `, [signature.rows[0].oid]);
  assert.deepEqual(acl.rows, []);

  const denied = await callAtomicDraft({}, anonKey);
  assert.equal(denied.response.ok, false, denied.text);
  assert.ok([401, 403, 404].includes(denied.response.status), denied.text);
  assertNoMaterialization(await readMaterialization(), 'anon invocation must leave no booking data');
});

test('public draft route fails closed on a required-write fault with no IDs, payable rows or success notification', async () => {
  const contactEmail = 'issue1811-public-fault@example.invalid';
  const logStart = webServerLogs.length;
  const fault = FAULT_CASES.find(({ name }) => name === 'order_items_insert');
  assert.ok(fault);
  const incidentCountBefore = await countDraftFaultIncidents(fault.marker);
  await installFaultInjection(fault);
  let failed;
  try {
    failed = await callPublicDraft({ contactEmail });
  } finally {
    await dropFaultInjection();
  }

  const faultEvidence = await waitForPublicFaultEvidence(fault.marker, logStart, incidentCountBefore);
  const snapshot = await readMaterialization();
  const diagnostic = {
    status: failed.response.status,
    success: failed.payload?.success ?? null,
    errorCode: failed.payload?.error?.code ?? null,
    hasBookingId: typeof failed.payload?.data?.bookingId === 'string',
    hasOrderId: typeof failed.payload?.data?.orderId === 'string',
    counts: materializationCounts(snapshot),
  };
  assert.ok(
    faultEvidence,
    `${PUBLIC_RED_MARKER}: required-write fault seam was not observed; ${JSON.stringify(diagnostic)}`,
  );
  console.log(`${PUBLIC_FAULT_REACHED_MARKER}:${fault.marker}:${faultEvidence}`);
  console.log(`${PUBLIC_FAULT_RESULT_MARKER}:${JSON.stringify(diagnostic)}`);
  assertNoMaterialization(
    snapshot,
    `${PUBLIC_RED_MARKER}: public route fault must leave no payable booking/order materialization; ${JSON.stringify(diagnostic)}`,
  );
  assert.deepEqual(
    diagnostic,
    {
      status: 500,
      success: false,
      errorCode: 'INTERNAL_ERROR',
      hasBookingId: false,
      hasOrderId: false,
      counts: { bookings: 0, orders: 0, items: 0, statusLogs: 0 },
    },
    `${PUBLIC_RED_MARKER}: current route must expose only the canonical fail-closed result`,
  );
  assert.equal(failed.response.status, 500, `${PUBLIC_RED_MARKER}: ${failed.text}`);
  assert.deepEqual(failed.payload, {
    success: false,
    error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' },
  }, `${PUBLIC_RED_MARKER}: fault response must remain fail-closed`);
  assert.doesNotMatch(
    failed.text,
    /orderId|bookingId|checkoutUrl|paymentUrl/iu,
    `${PUBLIC_RED_MARKER}: failed public response must not expose an identifier or payment entry`,
  );
  await delay(500);
  assert.doesNotMatch(
    webServerLogs.slice(logStart),
    new RegExp(contactEmail.replace('.', '\\.'), 'u'),
    `${PUBLIC_RED_MARKER}: failed public route must not reach the success email notification seam`,
  );
});

fullRuntimeTest('public draft route ignores request totals and returns the committed PostgREST read-back aggregate', async () => {
  const contactEmail = 'issue1811-public-success@example.invalid';
  const created = await callPublicDraft({ contactEmail });
  assert.equal(created.response.status, 200, created.text);
  assert.equal(created.payload?.success, true, created.text);
  assert.equal(created.payload?.data?.amount, BASE_TOTAL_TWD, created.text);
  assert.equal(created.payload?.data?.currency, 'TWD');
  assert.equal(created.payload?.data?.bookingStatus, 'draft');
  assert.equal(created.payload?.data?.orderStatus, 'pending_payment');
  assert.equal(created.payload?.data?.bookingType, 'scheduled');
  assert.match(created.payload?.data?.bookingId, /^[0-9a-f-]{36}$/iu);
  assert.match(created.payload?.data?.orderId, /^[0-9a-f-]{36}$/iu);
  assert.notEqual(created.payload?.data?.amount, 1);
  assert.notEqual(created.payload?.data?.amount, 2);
  assert.notEqual(created.payload?.data?.amount, 3);

  const snapshot = await readMaterialization();
  assert.equal(snapshot.bookings.length, 1);
  assert.equal(snapshot.orders.length, 1);
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.statusLogs.length, 1);
  assert.equal(snapshot.bookings[0].id, created.payload.data.bookingId);
  assert.equal(snapshot.orders[0].id, created.payload.data.orderId);
  assert.equal(snapshot.bookings[0].order_id, snapshot.orders[0].id);
  assert.equal(snapshot.orders[0].booking_id, snapshot.bookings[0].id);
  assert.equal(Number(snapshot.orders[0].total_twd), BASE_TOTAL_TWD);
  assert.equal(
    snapshot.items.reduce((sum, item) => sum + Number(item.subtotal_amount), 0),
    Number(snapshot.orders[0].total_twd),
  );
  await waitForWebLog(new RegExp(contactEmail.replace('.', '\\.'), 'u'));
});

fullRuntimeTest('service-role RPC commits one reconciled base booking using the active plan price, then permits durable read-back', async () => {
  const created = await callAtomicDraft();
  assert.equal(created.response.status, 200, created.text);
  assert.ok(created.payload && typeof created.payload === 'object' && !Array.isArray(created.payload), created.text);
  assert.match(created.payload.booking_id, /^[0-9a-f-]{36}$/iu);
  assert.match(created.payload.order_id, /^[0-9a-f-]{36}$/iu);
  assert.equal(created.payload.booking_status, 'draft');
  assert.equal(created.payload.order_status, 'pending_payment');
  assert.equal(created.payload.total_twd, BASE_TOTAL_TWD);

  const snapshot = await readMaterialization();
  assert.equal(snapshot.bookings.length, 1);
  assert.equal(snapshot.orders.length, 1);
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.statusLogs.length, 1);

  const [booking] = snapshot.bookings;
  const [order] = snapshot.orders;
  const [item] = snapshot.items;
  const [statusLog] = snapshot.statusLogs;
  assert.equal(booking.id, created.payload.booking_id);
  assert.equal(order.id, created.payload.order_id);
  assert.equal(booking.order_id, order.id);
  assert.equal(order.booking_id, booking.id);
  assert.equal(booking.activity_id, ACTIVITY_ID);
  assert.equal(booking.activity_plan_id, PLAN_ID);
  assert.equal(booking.guide_id, GUIDE_ID);
  assert.equal(booking.status, 'draft');
  assert.equal(booking.guide_approval_status, 'not_required');
  assert.equal(order.status, 'pending_payment');
  assert.equal(order.payment_status, 'pending');
  assert.equal(Number(order.total_twd), BASE_TOTAL_TWD);
  assert.equal(created.payload.total_twd, Number(order.total_twd), 'RPC amount must equal committed order read-back');
  assert.equal(item.order_id, order.id);
  assert.equal(item.booking_id, booking.id);
  assert.equal(item.ref_id, booking.id);
  assert.equal(item.item_type, 'activity_booking');
  assert.equal(Number(item.quantity), 2);
  assert.equal(Number(item.unit_price), 3_700);
  assert.equal(Number(item.subtotal_amount), BASE_TOTAL_TWD);
  assert.equal(
    Number(item.quantity) * Number(item.unit_price),
    Number(item.subtotal_amount),
    'base line subtotal must be independently reconcilable from quantity and the DB plan price',
  );
  assert.equal(
    snapshot.items.reduce((sum, row) => sum + Number(row.subtotal_amount), 0),
    Number(order.total_twd),
    'base order items must fully explain the payable total',
  );
  assert.equal(statusLog.booking_id, booking.id);
  assert.equal(statusLog.from_status, null);
  assert.equal(statusLog.to_status, 'draft');
  assert.equal(statusLog.actor_role, 'system');
});

fullRuntimeTest('authenticated traveler identity is copied consistently to booking, order and the initial audit log', async () => {
  const created = await callAtomicDraft({
    p_traveler_id: TRAVELER_ID,
    p_contact_email: 'issue1811-authenticated@example.invalid',
    p_correlation_id: 'issue1811-authenticated-runtime-contract',
  });
  assert.equal(created.response.status, 200, created.text);

  const snapshot = await readMaterialization();
  assert.equal(snapshot.bookings.length, 1);
  assert.equal(snapshot.orders.length, 1);
  assert.equal(snapshot.statusLogs.length, 1);
  assert.equal(snapshot.bookings[0].traveler_id, TRAVELER_ID);
  assert.equal(snapshot.orders[0].user_id, TRAVELER_ID);
  assert.equal(snapshot.statusLogs[0].actor_user_id, TRAVELER_ID);
  assert.equal(snapshot.statusLogs[0].actor_role, 'traveler');
});

fullRuntimeTest('authoritative plan pricing rejects int4 overflow before any payable row is committed', async () => {
  await client.query(
    'UPDATE public.activity_plans SET base_price = 2147483647 WHERE id = $1',
    [PLAN_ID],
  );
  let failed;
  try {
    failed = await callAtomicDraft({ p_correlation_id: 'issue1811-total-overflow' });
  } finally {
    await client.query('UPDATE public.activity_plans SET base_price = 3700 WHERE id = $1', [PLAN_ID]);
  }

  assert.equal(failed.response.ok, false, failed.text);
  assert.match(failed.text, /ORDER_TOTAL_OUT_OF_RANGE|22003/iu);
  assertNoMaterialization(
    await readMaterialization(),
    'overflow rejection must happen before an order can become payable',
  );
});

fullRuntimeTest('every required write seam fails the public RPC and rolls back booking, order, item and status log together', async () => {
  for (const fault of FAULT_CASES) {
    await cleanupMaterialization();
    await installFaultInjection(fault);
    let failed;
    try {
      failed = await callAtomicDraft({ p_correlation_id: `issue1811-fault-${fault.name}` });
    } finally {
      await dropFaultInjection();
    }

    assert.equal(failed.response.ok, false, `${fault.name}: ${failed.text}`);
    assert.match(failed.text, new RegExp(fault.marker, 'u'));
    assert.equal(
      failed.payload && typeof failed.payload === 'object'
        ? Object.prototype.hasOwnProperty.call(failed.payload, 'order_id')
        : false,
      false,
      `${fault.name}: failed result must not expose an order id`,
    );
    assertNoMaterialization(
      await readMaterialization(),
      `${fault.name}: the statement transaction must roll every required write back`,
    );
  }
});

fullRuntimeTest('cancelling the in-flight transaction at the final write seam rolls the whole aggregate back', async () => {
  await installCancellationBlock();
  await client.query('SELECT pg_catalog.pg_advisory_lock($1, $2)', [CANCEL_LOCK_CLASS, CANCEL_LOCK_OBJECT]);
  let pending;
  try {
    pending = callAtomicDraft({ p_correlation_id: 'issue1811-cancelled-transaction' });
    const backendPid = await waitForBlockedAtomicBackend();
    const cancellation = await client.query(
      'SELECT pg_catalog.pg_cancel_backend($1) AS cancelled',
      [backendPid],
    );
    assert.equal(cancellation.rows[0]?.cancelled, true);

    const failed = await pending;
    assert.equal(failed.response.ok, false, failed.text);
    assert.match(failed.text, /canceling statement due to user request|57014/iu);
    assert.doesNotMatch(failed.text, /"order_id"\s*:/iu);
  } finally {
    await client.query('SELECT pg_catalog.pg_advisory_unlock($1, $2)', [CANCEL_LOCK_CLASS, CANCEL_LOCK_OBJECT]);
    if (pending) await pending.catch(() => {});
    await dropFaultInjection();
  }

  assertNoMaterialization(
    await readMaterialization(),
    'query cancellation must abort the statement transaction and leave no partial aggregate',
  );
});

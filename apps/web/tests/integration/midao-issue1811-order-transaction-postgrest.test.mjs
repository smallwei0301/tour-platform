import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import pg from 'pg';

const GUIDE_ID = '18110000-0000-4000-8000-000000000001';
const ACTIVITY_ID = '18110000-0000-4000-8000-000000000002';
const PLAN_ID = '18110000-0000-4000-8000-000000000003';
const START_AT = '2027-01-15T02:00:00.000Z';
const END_AT = '2027-01-15T04:00:00.000Z';
const PAYMENT_DEADLINE_AT = '2027-01-16T02:00:00.000Z';
const CONTACT_EMAIL = 'issue1811-atomic@example.invalid';
const BASE_TOTAL_TWD = 7_400;
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

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const apiUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

assert.ok(databaseUrl, 'issue #1811 PostgREST runner must provide a local database URL');
assert.ok(apiUrl && serviceRoleKey && anonKey, 'issue #1811 runner must provide local API credentials');
for (const value of [databaseUrl, apiUrl]) {
  const parsed = new URL(value);
  assert.equal(parsed.hostname, '127.0.0.1', 'issue #1811 integration must remain on exact loopback');
  assert.equal(parsed.search, '');
  assert.equal(parsed.hash, '');
}

let client;

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
    `/rest/v1/bookings?select=id,booking_no,status,order_id,activity_id,activity_plan_id,guide_id,guide_approval_status,participants,timezone,start_at,end_at,customer_note&activity_plan_id=eq.${PLAN_ID}`,
  );
  const orders = await getRows(
    `/rest/v1/orders?select=id,booking_id,status,payment_status,total_twd,people_count,contact_name,contact_phone,contact_email,activity_id,source_channel,payment_deadline_at&activity_id=eq.${ACTIVITY_ID}`,
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
      `/rest/v1/booking_status_logs?select=id,booking_id,from_status,to_status,actor_role,reason,metadata&booking_id=${inFilter(bookingIds)}`,
    );
  return { bookings, orders, items, statusLogs };
}

function assertNoMaterialization(snapshot, label) {
  assert.deepEqual(
    Object.fromEntries(Object.entries(snapshot).map(([key, rows]) => [key, rows.length])),
    { bookings: 0, orders: 0, items: 0, statusLogs: 0 },
    label,
  );
}

async function dropFaultInjection() {
  for (const table of ['order_items', 'booking_status_logs']) {
    await client.query(`DROP TRIGGER IF EXISTS midao_issue1811_${table}_boom ON public.${table}`);
    await client.query(`DROP FUNCTION IF EXISTS public.midao_issue1811_${table}_boom()`);
  }
}

async function installFaultInjection(table, marker) {
  const functionName = `midao_issue1811_${table}_boom`;
  await client.query(`
    CREATE FUNCTION public.${functionName}()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fault$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '${marker}';
    END;
    $fault$;

    CREATE TRIGGER ${functionName}
      BEFORE INSERT ON public.${table}
      FOR EACH ROW EXECUTE FUNCTION public.${functionName}();
  `);
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
  await client.query('DELETE FROM public.activity_plans WHERE id = $1', [PLAN_ID]);
  await client.query('DELETE FROM public.activities WHERE id = $1', [ACTIVITY_ID]);
  await client.query('DELETE FROM public.guide_profiles WHERE id = $1', [GUIDE_ID]);
}

before(async () => {
  client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await cleanupFixtures();
  await client.query('BEGIN');
  try {
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
        'per_person', 3700, 1, 8, 'instant', 'active', true
      )
    `, [PLAN_ID, ACTIVITY_ID]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
});

beforeEach(async () => {
  await dropFaultInjection();
  await cleanupMaterialization();
});

after(async () => {
  if (!client) return;
  try { await cleanupFixtures(); } finally { await client.end(); }
});

test('runtime catalog exposes the exact authoritative-total RPC as a pinned SECURITY INVOKER function', async () => {
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

test('runtime ACL grants the RPC only to service_role and PostgREST rejects anon', async () => {
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

test('service-role RPC commits one reconciled base booking using the active plan price, then permits durable read-back', async () => {
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
    snapshot.items.reduce((sum, row) => sum + Number(row.subtotal_amount), 0),
    Number(order.total_twd),
    'base order items must fully explain the payable total',
  );
  assert.equal(statusLog.booking_id, booking.id);
  assert.equal(statusLog.from_status, null);
  assert.equal(statusLog.to_status, 'draft');
  assert.equal(statusLog.actor_role, 'system');
});

test('required late writes fail the public RPC and roll back booking, order, item and status log together', async () => {
  const cases = [
    { table: 'order_items', marker: 'ISSUE1811_ORDER_ITEMS_BOOM' },
    { table: 'booking_status_logs', marker: 'ISSUE1811_STATUS_LOG_BOOM' },
  ];

  for (const fault of cases) {
    await cleanupMaterialization();
    await installFaultInjection(fault.table, fault.marker);
    let failed;
    try {
      failed = await callAtomicDraft({ p_correlation_id: `issue1811-fault-${fault.table}` });
    } finally {
      await dropFaultInjection();
    }

    assert.equal(failed.response.ok, false, `${fault.table}: ${failed.text}`);
    assert.match(failed.text, new RegExp(fault.marker, 'u'));
    assert.equal(
      failed.payload && typeof failed.payload === 'object'
        ? Object.prototype.hasOwnProperty.call(failed.payload, 'order_id')
        : false,
      false,
      `${fault.table}: failed result must not expose an order id`,
    );
    assertNoMaterialization(
      await readMaterialization(),
      `${fault.table}: the statement transaction must roll every required write back`,
    );
  }
});

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import pg from 'pg';

import {
  getMidaoBookingRequestDb,
  listMidaoRequestsDb,
} from '../../src/lib/midao/db-requests.mjs';
import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';

const GUIDE_ID = '99999999-9999-4999-8999-999999999999';
const OTHER_GUIDE_ID = '00000000-0000-4000-8000-000000000001';
const ACTIVITY_ID = 'eeeeeeee-1000-4000-8000-000000000001';
const PLAN_ID = 'dddddddd-1000-4000-8000-000000000001';
const BOOKING_IDS = [
  'aaaaaaaa-1000-4000-8000-000000000001',
  'aaaaaaaa-1000-4000-8000-000000000002',
  'aaaaaaaa-1000-4000-8000-000000000003',
];
const ORDER_IDS = [
  'bbbbbbbb-1000-4000-8000-000000000001',
  'bbbbbbbb-1000-4000-8000-000000000002',
  'bbbbbbbb-1000-4000-8000-000000000003',
];
const MESSAGE_IDS = [
  'cccccccc-1000-4000-8000-000000000001',
  'cccccccc-1000-4000-8000-000000000002',
  'cccccccc-1000-4000-8000-000000000003',
];
const EXTRA_ORDER_ID = 'bbbbbbbb-1000-4000-8000-000000000099';
const UPDATED_AT = '2026-07-28T00:30:00.123Z';
// Two rows share the exact microsecond and the third differs only below JS millisecond
// precision. Without DB-side key normalization, the signed gateway cursor truncates
// the second row and silently skips the third page row.
const ROW_UPDATED_AT = [
  '2026-07-28T00:30:00.123123+00:00',
  '2026-07-28T00:30:00.123456+00:00',
  '2026-07-28T00:30:00.123456+00:00',
];
const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const apiUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

assert.ok(databaseUrl, 'PostgREST integration runner must provide a local database URL');
assert.ok(apiUrl && serviceRoleKey && anonKey, 'PostgREST integration runner must provide local API credentials');
for (const value of [databaseUrl, apiUrl]) {
  const parsed = new URL(value);
  assert.equal(parsed.hostname, '127.0.0.1', 'Task14 integration must remain on exact loopback');
}

let client;
let previousGuideSessionSecret;

async function cleanupFixtures() {
  await client.query('DELETE FROM public.order_messages WHERE id = ANY($1::uuid[])', [MESSAGE_IDS]);
  await client.query('DELETE FROM public.orders WHERE id = $1', [EXTRA_ORDER_ID]);
  await client.query('UPDATE public.bookings SET order_id = NULL WHERE id = ANY($1::uuid[])', [BOOKING_IDS]);
  await client.query('UPDATE public.orders SET booking_id = NULL WHERE id = ANY($1::uuid[])', [ORDER_IDS]);
  await client.query('DELETE FROM public.bookings WHERE id = ANY($1::uuid[])', [BOOKING_IDS]);
  await client.query('DELETE FROM public.orders WHERE id = ANY($1::uuid[])', [ORDER_IDS]);
  await client.query('DELETE FROM public.activity_plans WHERE id = $1', [PLAN_ID]);
  await client.query('DELETE FROM public.activities WHERE id = $1', [ACTIVITY_ID]);
}

before(async () => {
  client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await cleanupFixtures();
  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO public.activities(id, guide_id, guide_slug, title, slug, status, created_at, updated_at)
      VALUES ($1, $2, 'midao-e2e-guide', 'Task14 真實需求', 'task14-real-request-projection', 'published', $3, $3)
    `, [ACTIVITY_ID, GUIDE_ID, UPDATED_AT]);
    await client.query(`
      INSERT INTO public.activity_plans(
        id, activity_id, name, slug, duration_minutes, price_type, base_price,
        min_participants, max_participants, booking_type, status, created_at, updated_at
      ) VALUES ($1, $2, 'Task14 Request Plan', 'task14-request-plan', 120, 'per_person', 1800,
        1, 8, 'request', 'active', $3, $3)
    `, [PLAN_ID, ACTIVITY_ID, UPDATED_AT]);

    for (let index = 0; index < BOOKING_IDS.length; index += 1) {
      const suffix = index + 1;
      const rowUpdatedAt = ROW_UPDATED_AT[index];
      await client.query(`
        INSERT INTO public.orders(
          id, activity_id, status, people_count, total_twd, contact_name, contact_phone,
          contact_email, admin_note, created_at, updated_at, payment_deadline_at, source_channel
        ) VALUES ($1, $2, 'pending_payment', 2, $3, $4, $5, $6, $7, $8, $8, $9, 'web')
      `, [
        ORDER_IDS[index], ACTIVITY_ID, 3600 + index,
        `Task14 Traveler ${suffix}`, `0900-PRIVATE-${suffix}`,
        `task14-private-${suffix}@example.invalid`, `ADMIN-SECRET-${suffix}`,
        rowUpdatedAt, '2026-07-29T00:30:00.000Z',
      ]);
      await client.query(`
        INSERT INTO public.bookings(
          id, booking_no, guide_id, activity_id, activity_plan_id, start_at, end_at,
          timezone, participants, status, order_id, customer_note, internal_note,
          guide_approval_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Asia/Taipei', 2, 'draft', $8, $9, $10,
          'pending', $11, $11)
      `, [
        BOOKING_IDS[index], `MIDAO-T14-${suffix}`, GUIDE_ID, ACTIVITY_ID, PLAN_ID,
        `2026-08-0${suffix}T10:00:00+08:00`, `2026-08-0${suffix}T12:00:00+08:00`,
        ORDER_IDS[index], `CUSTOMER-SECRET-${suffix}`, `INTERNAL-SECRET-${suffix}`, rowUpdatedAt,
      ]);
      await client.query('UPDATE public.orders SET booking_id = $1 WHERE id = $2', [BOOKING_IDS[index], ORDER_IDS[index]]);
      await client.query(`
        INSERT INTO public.order_messages(id, order_id, sender_role, sender_id, body, created_at)
        VALUES ($1, $2, 'traveler', 'task14-traveler', $3, $4)
      `, [MESSAGE_IDS[index], ORDER_IDS[index], `MESSAGE-SECRET-${suffix}`, rowUpdatedAt]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  previousGuideSessionSecret = process.env.GUIDE_SESSION_SECRET;
  process.env.GUIDE_SESSION_SECRET = 'task14-local-cursor-secret-0123456789abcdef';
  __setSupabaseClientForTest(null);
});

after(async () => {
  __setSupabaseClientForTest(null);
  if (previousGuideSessionSecret === undefined) delete process.env.GUIDE_SESSION_SECRET;
  else process.env.GUIDE_SESSION_SECRET = previousGuideSessionSecret;
  try { await cleanupFixtures(); } finally { await client?.end(); }
});

function serviceHeaders() {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  };
}

async function postgrest(path, { body, headers = serviceHeaders() } = {}) {
  const response = await fetch(new URL(path, apiUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload, text };
}

async function rpc(overrides = {}, headers) {
  return postgrest('/rest/v1/rpc/midao_list_booking_requests', {
    headers,
    body: {
      p_guide_id: GUIDE_ID,
      p_bucket: 'all',
      p_sort: 'updated_desc',
      p_cursor_rank: null,
      p_cursor_at: null,
      p_cursor_id: null,
      p_limit: 2,
      ...overrides,
    },
  });
}

function assertSecretsAbsent(value, secrets) {
  const serialized = JSON.stringify(value);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, `secret leaked: ${secret}`);
}

test('Task14 migration compiles with exact return shape, index, FK identity and service-role-only RPC ACL', async () => {
  const signature = 'public.midao_list_booking_requests(uuid,text,text,integer,timestamptz,uuid,integer)';
  const catalog = await client.query(`
    SELECT pg_get_function_result(p.oid) AS result,
           p.prosecdef,
           p.proconfig,
           p.proowner::regrole::text AS owner
      FROM pg_catalog.pg_proc p
     WHERE p.oid = $1::regprocedure
  `, [signature]);
  assert.equal(catalog.rowCount, 1);
  assert.equal(catalog.rows[0].prosecdef, false);
  assert.deepEqual(catalog.rows[0].proconfig, ['search_path=pg_catalog, public']);
  for (const field of ['booking_id uuid', 'order_id uuid', 'bucket text', 'updated_at timestamp with time zone', 'priority_rank integer']) {
    assert.match(catalog.rows[0].result, new RegExp(field, 'u'));
  }
  for (const forbidden of ['contact_phone', 'customer_note', 'admin_note', 'internal_note', 'body']) {
    assert.doesNotMatch(catalog.rows[0].result, new RegExp(forbidden, 'u'));
  }

  const objects = await client.query(`
    SELECT to_regclass('public.idx_order_messages_order_latest')::text AS request_index,
           (SELECT conname FROM pg_catalog.pg_constraint
             WHERE conrelid = 'public.orders'::regclass
               AND contype = 'f'
               AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
                                    WHERE attrelid = 'public.orders'::regclass AND attname = 'booking_id')]::smallint[]) AS booking_fk
  `);
  assert.deepEqual(objects.rows[0], {
    request_index: 'idx_order_messages_order_latest',
    booking_fk: 'orders_booking_id_fkey',
  });

  const privileges = await client.query(`
    SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
           has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated,
           has_function_privilege('service_role', $1, 'EXECUTE') AS service_role
  `, [signature]);
  assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service_role: true });
  const acl = await client.query(`
    SELECT COALESCE(role_row.rolname, 'PUBLIC') AS grantee, exploded.privilege_type
      FROM pg_catalog.pg_proc function_row
      CROSS JOIN LATERAL pg_catalog.aclexplode(function_row.proacl) exploded
      LEFT JOIN pg_catalog.pg_roles role_row ON role_row.oid = exploded.grantee
     WHERE function_row.oid = $1::regprocedure
       AND exploded.grantee <> function_row.proowner
     ORDER BY grantee, privilege_type
  `, [signature]);
  assert.deepEqual(acl.rows, [
    { grantee: 'postgres', privilege_type: 'EXECUTE' },
    { grantee: 'service_role', privilege_type: 'EXECUTE' },
  ]);
});

test('NULL required parameters and partial cursor tuples reject with SQLSTATE 22023 instead of unbounded work', async () => {
  const cases = [
    {
      sql: "SELECT * FROM public.midao_list_booking_requests(NULL, 'all', 'priority', NULL, NULL, NULL, 20)",
      message: 'MIDAO_REQUESTS_GUIDE_REQUIRED',
    },
    {
      sql: "SELECT * FROM public.midao_list_booking_requests($1, NULL, 'priority', NULL, NULL, NULL, 20)",
      message: 'MIDAO_REQUESTS_BUCKET_INVALID',
    },
    {
      sql: "SELECT * FROM public.midao_list_booking_requests($1, 'all', NULL, NULL, NULL, NULL, 20)",
      message: 'MIDAO_REQUESTS_SORT_INVALID',
    },
    {
      sql: "SELECT * FROM public.midao_list_booking_requests($1, 'all', 'priority', NULL, NULL, NULL, NULL)",
      message: 'MIDAO_REQUESTS_LIMIT_INVALID',
    },
    {
      sql: "SELECT * FROM public.midao_list_booking_requests($1, 'all', 'priority', 1, NULL, NULL, 20)",
      message: 'MIDAO_REQUESTS_CURSOR_INVALID',
    },
  ];
  for (const probe of cases) {
    await assert.rejects(client.query(probe.sql, probe.sql.includes('$1') ? [GUIDE_ID] : []), (error) => {
      assert.equal(error.code, '22023');
      assert.equal(error.message, probe.message);
      return true;
    });
  }
});

test('real RPC fails closed for missing reciprocal and non-unique booking-order relations', async () => {
  const assertRelationFailure = async (label) => {
    const result = await rpc({ p_limit: 20 });
    assert.equal(result.response.status, 400, `${label}: ${result.text}`);
    assert.equal(result.payload?.code, '22023');
    assert.equal(result.payload?.message, 'MIDAO_REQUESTS_RELATION_INVALID');
  };

  try {
    await client.query('UPDATE public.orders SET booking_id = NULL WHERE id = $1', [ORDER_IDS[0]]);
    await assertRelationFailure('missing reciprocal order.booking_id');
  } finally {
    await client.query('UPDATE public.orders SET booking_id = $1 WHERE id = $2', [BOOKING_IDS[0], ORDER_IDS[0]]);
  }

  await client.query(`
    INSERT INTO public.orders(
      id, activity_id, status, people_count, total_twd, contact_name,
      created_at, updated_at, booking_id, source_channel
    ) VALUES ($1, $2, 'pending_payment', 1, 1, 'Duplicate relation probe', $3, $3, $4, 'web')
  `, [EXTRA_ORDER_ID, ACTIVITY_ID, UPDATED_AT, BOOKING_IDS[0]]);
  try {
    await assertRelationFailure('non-unique orders.booking_id');
  } finally {
    await client.query('DELETE FROM public.orders WHERE id = $1', [EXTRA_ORDER_ID]);
  }
});

test('real PostgREST RPC and relation hint enforce ownership, bounded keyset, list redaction and NULL rejection', async () => {
  const first = await rpc();
  assert.equal(first.response.status, 200, first.text);
  assert.deepEqual(first.payload.map(({ booking_id }) => booking_id), [BOOKING_IDS[2], BOOKING_IDS[1]]);
  assert.deepEqual(Object.keys(first.payload[0]).sort(), [
    'activity_id', 'activity_plan_id', 'activity_title', 'booking_id', 'booking_no', 'booking_status',
    'booking_type', 'bucket', 'display_name', 'email_masked', 'end_at', 'guide_approval_status',
    'guide_id', 'last_message_at', 'needs_reply', 'order_id', 'order_status', 'party_size',
    'payment_deadline_at', 'plan_name', 'priority_rank', 'received_at', 'secondary_state', 'start_at',
    'timezone', 'total_twd', 'updated_at',
  ].sort());
  assertSecretsAbsent(first.payload, [
    '0900-PRIVATE', 'task14-private-', 'CUSTOMER-SECRET', 'ADMIN-SECRET', 'INTERNAL-SECRET', 'MESSAGE-SECRET',
  ]);

  const second = await rpc({
    p_cursor_rank: 0,
    p_cursor_at: first.payload.at(-1).updated_at,
    p_cursor_id: first.payload.at(-1).booking_id,
  });
  assert.equal(second.response.status, 200, second.text);
  assert.deepEqual(second.payload.map(({ booking_id }) => booking_id), [BOOKING_IDS[0]]);
  assert.equal(new Set([...first.payload, ...second.payload].map(({ booking_id }) => booking_id)).size, 3);

  const wrongOwner = await rpc({ p_guide_id: OTHER_GUIDE_ID, p_limit: 20 });
  assert.equal(wrongOwner.response.status, 200, wrongOwner.text);
  assert.deepEqual(wrongOwner.payload, []);

  const nullLimit = await rpc({ p_limit: null });
  assert.equal(nullLimit.response.status, 400, nullLimit.text);
  assert.match(nullLimit.text, /MIDAO_REQUESTS_LIMIT_INVALID/u);

  const anon = await rpc({}, {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    'content-type': 'application/json',
  });
  assert.equal(anon.response.ok, false, anon.text);

  const select = [
    'id,booking_no,guide_id,order_id,activity_id,activity_plan_id,status,guide_approval_status,',
    'guide_approval_decided_at,guide_approval_note,start_at,end_at,timezone,participants,customer_note,created_at,updated_at,',
    'activities!inner(id,title),activity_plans!inner(id,name,booking_type),',
    'orders!orders_booking_id_fkey(id,booking_id,status,total_twd,contact_name,contact_email,contact_phone,payment_deadline_at,created_at,updated_at,order_messages(id,sender_role,created_at))',
  ].join('');
  const relation = await postgrest(`/rest/v1/bookings?select=${encodeURIComponent(select)}&guide_id=eq.${GUIDE_ID}&id=eq.${BOOKING_IDS[0]}`);
  assert.equal(relation.response.status, 200, relation.text);
  assert.equal(relation.payload.length, 1);
  assert.equal(relation.payload[0].orders.length, 1);
  assert.equal(relation.payload[0].orders[0].contact_phone, '0900-PRIVATE-1');
  assertSecretsAbsent(relation.payload, ['ADMIN-SECRET', 'INTERNAL-SECRET', 'MESSAGE-SECRET']);

  const wrongHint = select.replace('orders!orders_booking_id_fkey', 'orders!fk_orders_booking_id');
  const rejected = await postgrest(`/rest/v1/bookings?select=${encodeURIComponent(wrongHint)}&id=eq.${BOOKING_IDS[0]}`);
  assert.equal(rejected.response.status, 400, rejected.text);
  assert.match(rejected.text, /relationship|fk_orders_booking_id|PGRST/u);
});

test('real gateway normalizes PostgREST timestamps and preserves list/detail PII boundaries', async () => {
  const first = await listMidaoRequestsDb({ guideId: GUIDE_ID, sort: 'updated_desc', limit: 2 });
  assert.deepEqual(first.items.map(({ bookingId }) => bookingId), [BOOKING_IDS[2], BOOKING_IDS[1]]);
  assert.equal(first.items[0].updatedAt, UPDATED_AT);
  assert.equal(typeof first.nextCursor, 'string');
  const second = await listMidaoRequestsDb({
    guideId: GUIDE_ID,
    sort: 'updated_desc',
    limit: 2,
    cursor: first.nextCursor,
  });
  assert.deepEqual(second.items.map(({ bookingId }) => bookingId), [BOOKING_IDS[0]]);
  assert.equal(new Set([...first.items, ...second.items].map(({ bookingId }) => bookingId)).size, 3);
  assertSecretsAbsent(first, [
    '0900-PRIVATE', 'task14-private-', 'CUSTOMER-SECRET', 'ADMIN-SECRET', 'INTERNAL-SECRET', 'MESSAGE-SECRET',
  ]);

  const detail = await getMidaoBookingRequestDb({ guideId: GUIDE_ID, bookingId: BOOKING_IDS[0] });
  assert.equal(detail.bookingId, BOOKING_IDS[0]);
  assert.equal(detail.orderId, ORDER_IDS[0]);
  assert.equal(detail.traveler.contactPhone, '0900-PRIVATE-1');
  assert.equal(detail.traveler.contactEmail, 'task14-private-1@example.invalid');
  assert.equal(detail.request.customerNote, 'CUSTOMER-SECRET-1');
  assertSecretsAbsent(detail, ['ADMIN-SECRET', 'INTERNAL-SECRET', 'MESSAGE-SECRET']);
  await assert.rejects(
    getMidaoBookingRequestDb({ guideId: OTHER_GUIDE_ID, bookingId: BOOKING_IDS[0] }),
    /BOOKING_NOT_FOUND/u,
  );
});

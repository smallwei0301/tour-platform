import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before, beforeEach } from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'local Midao runner must provide DATABASE_URL');
const localDatabaseUrl = new URL(databaseUrl);
assert.equal(localDatabaseUrl.protocol, 'postgresql:', 'Issue #1796 integration test only permits PostgreSQL');
assert.equal(localDatabaseUrl.hostname, '127.0.0.1', 'Issue #1796 integration test only permits loopback PostgreSQL');
assert.equal(localDatabaseUrl.port, '54322', 'Issue #1796 integration test only permits the local Supabase PostgreSQL port');
assert.equal(localDatabaseUrl.pathname, '/postgres', 'Issue #1796 integration test only permits the local Supabase postgres database');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(HERE, '../api/fixtures/midao-task38-seed.sql');
const LATEST_EXPIRY_MIGRATION_PATH = path.join(
  HERE,
  '../../../../supabase/migrations/20260914073000_issue1796_expire_unpaid_order_variable_conflict_fix.sql',
);

const GUIDE_ID = '22222222-0000-0000-0000-000000000001';
const PLAN_ID = '44444444-0000-0000-0000-000000000001';
const INQUIRY_ID = '55555555-0000-0000-0000-000000000001';
const START_AT = '2026-09-10T02:00:00.000Z';
const END_AT = '2026-09-10T06:00:00.000Z';

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const CONVERT_SQL = `SELECT public.midao_convert_inquiry_to_booking(
  $1::uuid, $2::text, $3::text, $4::uuid, $5::uuid, $6::timestamptz, $7::timestamptz,
  $8::integer, $9::integer, $10::text, $11::integer, $12::text,
  $13::text, $14::text, $15::text, $16::text, $17::text
) AS result`;

function convertArgs() {
  const nonce = randomUUID();
  return [
    GUIDE_ID,
    'guide',
    'issue1796-actor',
    INQUIRY_ID,
    PLAN_ID,
    START_AT,
    END_AT,
    2,
    6000,
    'Issue 1796 disposable fixture',
    2,
    sha256(`issue1796-token-${nonce}`),
    'Issue 1796 Traveler',
    '0900000000',
    'issue1796@example.test',
    `issue1796-${nonce}`,
    sha256(`issue1796-request-${nonce}`),
  ];
}

let client;

before(async () => {
  client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(readFileSync(LATEST_EXPIRY_MIGRATION_PATH, 'utf8'));
  await client.query("SET lock_timeout = '5s'");
  await client.query("SET statement_timeout = '30s'");
});

after(async () => {
  await client?.end();
});

beforeEach(async () => {
  // The current schema mirrors auth.users into public.users via a trigger, while
  // this historical disposable seed also inserts the same public.users rows.
  // Disable triggers only while loading the fully explicit fixture; restore
  // them before exercising the RPC so production behavior remains covered.
  await client.query("SET session_replication_role = 'replica'");
  try {
    await client.query(readFileSync(SEED_PATH, 'utf8'));
  } finally {
    await client.query("SET session_replication_role = 'origin'");
  }
});

test('Issue #1796: expired pending-payment order cancels booking exactly once and repeat is a noop', async () => {
  const created = (await client.query(CONVERT_SQL, convertArgs())).rows[0].result;

  const { rows: firstRows } = await client.query(
    "SELECT * FROM public.fn_expire_unpaid_order_atomic($1::uuid, now() + interval '48 hours')",
    [created.order_id],
  );
  const first = firstRows[0];
  assert.equal(first.expired, true);
  assert.equal(first.order_status, 'cancelled_unpaid');
  assert.equal(first.booking_id, created.booking_id);
  assert.equal(first.booking_status, 'cancelled');

  const { rows: persistedRows } = await client.query(
    `SELECT b.status AS booking_status, o.status AS order_status
     FROM public.bookings b
     JOIN public.orders o ON o.id = $2::uuid
     WHERE b.id = $1::uuid`,
    [created.booking_id, created.order_id],
  );
  assert.deepEqual(persistedRows, [{ booking_status: 'cancelled', order_status: 'cancelled_unpaid' }]);

  const { rows: firstLogRows } = await client.query(
    `SELECT count(*)::integer AS count
     FROM public.booking_status_logs
     WHERE booking_id = $1::uuid AND reason = 'payment_deadline_expired'`,
    [created.booking_id],
  );
  assert.equal(firstLogRows[0].count, 1);

  const { rows: repeatRows } = await client.query(
    "SELECT * FROM public.fn_expire_unpaid_order_atomic($1::uuid, now() + interval '48 hours')",
    [created.order_id],
  );
  assert.equal(repeatRows[0].expired, false);
  assert.equal(repeatRows[0].order_status, 'cancelled_unpaid');

  const { rows: repeatLogRows } = await client.query(
    `SELECT count(*)::integer AS count
     FROM public.booking_status_logs
     WHERE booking_id = $1::uuid AND reason = 'payment_deadline_expired'`,
    [created.booking_id],
  );
  assert.equal(repeatLogRows[0].count, 1, 'repeat must not append another payment-deadline log');
});

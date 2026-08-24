import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test, { after, before, beforeEach, describe } from 'node:test';
import pg from 'pg';

const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const GUIDE_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVITY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TRAVELER_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TRAVELER_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const describeLocal = DATABASE_URL ? describe : describe.skip;

function expectLocalDatabaseUrl(value) {
  const parsed = new URL(value);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '54322');
  assert.equal(parsed.pathname, '/postgres');
}

const ISSUE_SQL = `SELECT public.midao_issue_request_with_claim(
  $1::text, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::text,
  $8::date, $9::date, $10::text, $11::time, $12::time, $13::integer,
  $14::text, $15::text, $16::boolean, $17::text, $18::jsonb, $19::text
) AS result`;
const BRIDGE_SQL = 'SELECT public.midao_bridge_request_claim($1::text, $2::uuid, $3::text, $4::text) AS result';

async function issueClaim(client, label) {
  const requestNo = `CLAIM-${label}-${randomUUID().slice(0, 8)}`;
  const tokenHash = sha256(`token-${label}-${randomUUID()}`);
  const { rows } = await client.query(ISSUE_SQL, [
    requestNo, GUIDE_ID, ACTIVITY_ID, 'Claim integration activity', 'Local traveler', null, null,
    '2026-09-01', null, 'morning', '09:00', '11:00', 2, null, 'zh-TW', false, null, {}, tokenHash,
  ]);
  return { requestId: rows[0].result.request_id, requestNo, tokenHash };
}

async function bridge(client, { tokenHash, travelerId, idempotencyKey, requestHash = sha256('request-body') }) {
  const { rows } = await client.query(BRIDGE_SQL, [tokenHash, travelerId, idempotencyKey, requestHash]);
  return rows[0].result;
}

async function count(client, table, sourceRequestId) {
  const { rows } = await client.query(`SELECT count(*)::int AS count FROM public.${table} WHERE source_request_id = $1`, [sourceRequestId]);
  return rows[0].count;
}

describeLocal('midao request claim bridge local PostgreSQL contract', () => {
  let client;
  let ownerClient;
  const createdRequestIds = new Set();

  before(async () => {
    expectLocalDatabaseUrl(DATABASE_URL);
    client = new pg.Client({ connectionString: DATABASE_URL });
    const ownerUrl = new URL(DATABASE_URL);
    ownerUrl.username = 'supabase_admin';
    ownerClient = new pg.Client({ connectionString: ownerUrl.toString() });
    await client.connect();
    await ownerClient.connect();
    await client.query("SET statement_timeout = '30s'");
    await client.query(`
      INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
      VALUES
        ($1, 'authenticated', 'authenticated', 'claim-guide@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
        ($2, 'authenticated', 'authenticated', 'claim-traveler-a@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
        ($3, 'authenticated', 'authenticated', 'claim-traveler-b@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, [GUIDE_USER_ID, TRAVELER_A, TRAVELER_B]);
    await client.query(`
      INSERT INTO public.users (id, role)
      VALUES ($1, 'guide'), ($2, 'traveler'), ($3, 'traveler')
      ON CONFLICT (id) DO NOTHING
    `, [GUIDE_USER_ID, TRAVELER_A, TRAVELER_B]);
    await client.query(`
      INSERT INTO public.guide_profiles (
        id, user_id, slug, display_name, guide_email, guide_password_hash,
        verification_status, backend_mode, guide_session_version
      ) VALUES (
        $1, $2, 'claim-local-guide', 'Claim local guide', 'claim-guide@example.invalid',
        'claim-local-password-hash', 'approved', 'midao', 1
      ) ON CONFLICT (id) DO NOTHING
    `, [GUIDE_ID, GUIDE_USER_ID]);
    await client.query(`
      INSERT INTO public.activities (
        id, guide_id, guide_slug, title, slug, price_twd, min_participants,
        max_participants, duration_minutes, status, midao_status, midao_deal_mode, inquiry_enabled
      ) VALUES (
        $1, $2, 'claim-local-guide', 'Claim integration activity', 'claim-integration-activity',
        3600, 1, 6, 120, 'published', 'published', 'confirm_first', true
      ) ON CONFLICT (id) DO NOTHING
    `, [ACTIVITY_ID, GUIDE_ID]);
  });

  beforeEach(() => createdRequestIds.clear());

  after(async () => {
    await Promise.allSettled([client?.end(), ownerClient?.end()].filter(Boolean));
  });

  test('same traveler replays one immutable mapping while wrong travelers get the generic unavailable result and no booking side effect', async () => {
    const issued = await issueClaim(client, 'replay');
    createdRequestIds.add(issued.requestId);
    const first = await bridge(client, {
      tokenHash: issued.tokenHash,
      travelerId: TRAVELER_A,
      idempotencyKey: `claim-replay-${randomUUID()}`,
    });
    const replay = await bridge(client, {
      tokenHash: issued.tokenHash,
      travelerId: TRAVELER_A,
      idempotencyKey: `claim-replay-${randomUUID()}`,
    });
    const wrongTraveler = await bridge(client, {
      tokenHash: issued.tokenHash,
      travelerId: TRAVELER_B,
      idempotencyKey: `claim-wrong-user-${randomUUID()}`,
    });

    assert.equal(first.status, 'ok');
    assert.equal(first.created, true);
    assert.equal(replay.status, 'ok');
    assert.equal(replay.created, false);
    assert.equal(replay.inquiry_id, first.inquiry_id);
    assert.deepEqual(wrongTraveler, { status: 'unavailable' });
    assert.equal(await count(client, 'midao_request_inquiry_mappings', issued.requestId), 1);
    assert.equal(await count(client, 'midao_request_claims', issued.requestId), 1);

    const { rows: sideEffects } = await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.bookings) AS bookings,
        (SELECT count(*)::int FROM public.orders) AS orders,
        (SELECT count(*)::int FROM public.midao_notification_outbox WHERE aggregate_id = $1::text) AS outbox
    `, [first.inquiry_id]);
    assert.deepEqual(sideEffects[0], { bookings: 0, orders: 0, outbox: 0 });
  });

  test('two travelers racing one claim leave exactly one claimant, one inquiry and one mapping', async () => {
    const issued = await issueClaim(client, 'race');
    createdRequestIds.add(issued.requestId);
    const [left, right] = await Promise.all([
      bridge(client, { tokenHash: issued.tokenHash, travelerId: TRAVELER_A, idempotencyKey: `claim-race-a-${randomUUID()}` }),
      bridge(client, { tokenHash: issued.tokenHash, travelerId: TRAVELER_B, idempotencyKey: `claim-race-b-${randomUUID()}` }),
    ]);
    const results = [left, right];
    assert.equal(results.filter((result) => result.status === 'ok').length, 1);
    assert.equal(results.filter((result) => result.status === 'unavailable').length, 1);
    assert.equal(await count(client, 'midao_request_inquiry_mappings', issued.requestId), 1);
    const { rows } = await client.query(`
      SELECT claimed_by_user_id, claimed_at IS NOT NULL AS claimed_at
      FROM public.midao_request_claims WHERE source_request_id = $1
    `, [issued.requestId]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].claimed_at, true);
    assert.ok([TRAVELER_A, TRAVELER_B].includes(rows[0].claimed_by_user_id));
  });

  test('a revoked claim returns unavailable without leaving a processing idempotency record', async () => {
    const issued = await issueClaim(client, 'revoked');
    createdRequestIds.add(issued.requestId);
    await client.query(
      'UPDATE public.midao_request_claims SET revoked_at = now() WHERE source_request_id = $1',
      [issued.requestId],
    );

    const result = await bridge(client, {
      tokenHash: issued.tokenHash,
      travelerId: TRAVELER_A,
      idempotencyKey: `claim-revoked-${randomUUID()}`,
    });
    assert.deepEqual(result, { status: 'unavailable' });

    const { rows } = await client.query(`
      SELECT count(*)::int AS count
      FROM public.midao_idempotency_records
      WHERE scope_type = 'midao_request' AND scope_id = $1
        AND command_name = 'bridge_request_claim'
    `, [issued.requestId]);
    assert.equal(rows[0].count, 0);
  });

  test('claims and mappings remain service-role-only under forced RLS', async () => {
    const probeRole = `claim_probe_${process.pid}`;
    const issued = await issueClaim(client, 'acl');
    createdRequestIds.add(issued.requestId);
    try {
      await client.query(`CREATE ROLE ${probeRole} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
      await client.query(`GRANT ${probeRole} TO postgres`);
      await ownerClient.query(`GRANT USAGE ON SCHEMA public TO ${probeRole}`);
      await ownerClient.query(`GRANT SELECT, INSERT ON public.midao_request_claims TO ${probeRole}`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${probeRole}`);
      const hidden = await client.query('SELECT source_request_id FROM public.midao_request_claims WHERE source_request_id = $1', [issued.requestId]);
      assert.equal(hidden.rowCount, 0);
      await assert.rejects(
        () => client.query(`
          INSERT INTO public.midao_request_claims (source_request_id, token_hash, expires_at)
          VALUES ($1, $2, now() + interval '24 hours')
        `, [issued.requestId, sha256(`acl-${randomUUID()}`)]),
        (error) => error.code === '42501',
      );
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await ownerClient.query(`REVOKE ALL ON public.midao_request_claims FROM ${probeRole}`).catch(() => {});
      await ownerClient.query(`REVOKE ALL ON SCHEMA public FROM ${probeRole}`).catch(() => {});
      await client.query(`DROP ROLE IF EXISTS ${probeRole}`).catch(() => {});
    }
  });
});

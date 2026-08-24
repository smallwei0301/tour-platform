import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test, { after, before, describe } from 'node:test';
import pg from 'pg';

const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const describeLocal = DATABASE_URL ? describe : describe.skip;
const GUIDE_USER_ID = '11111111-1111-4111-8111-111111111111';
const GUIDE_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const TRAVELER_ID = '44444444-4444-4444-8444-444444444444';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const ISSUE_SQL = `SELECT public.midao_issue_request_with_claim(
  $1::text, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::text,
  $8::date, $9::date, $10::text, $11::time, $12::time, $13::integer,
  $14::text, $15::text, $16::boolean, $17::text, $18::jsonb, $19::text
) AS result`;
const BRIDGE_SQL = 'SELECT public.midao_bridge_request_claim($1::text, $2::uuid, $3::text, $4::text) AS result';

describeLocal('midao request-to-inquiry convergence local PostgreSQL contract', () => {
  let client;

  before(async () => {
    const url = new URL(DATABASE_URL);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, '54322');
    assert.equal(url.pathname, '/postgres');
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query("SET statement_timeout = '30s'");
    await client.query(`
      INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
      VALUES
        ($1, 'authenticated', 'authenticated', 'phase3-guide@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
        ($2, 'authenticated', 'authenticated', 'phase3-traveler@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, [GUIDE_USER_ID, TRAVELER_ID]);
    await client.query('INSERT INTO public.users (id, role) VALUES ($1, \'guide\'), ($2, \'traveler\') ON CONFLICT (id) DO NOTHING', [GUIDE_USER_ID, TRAVELER_ID]);
    await client.query(`
      INSERT INTO public.guide_profiles (id, user_id, slug, display_name, guide_email, guide_password_hash, verification_status, backend_mode, guide_session_version)
      VALUES ($1, $2, 'phase3-local-guide', 'Phase 3 local guide', 'phase3-guide@example.invalid', 'phase3-password-hash', 'approved', 'midao', 1)
      ON CONFLICT (id) DO NOTHING
    `, [GUIDE_ID, GUIDE_USER_ID]);
    await client.query(`
      INSERT INTO public.activities (id, guide_id, guide_slug, title, slug, price_twd, min_participants, max_participants, duration_minutes, status, midao_status, midao_deal_mode, inquiry_enabled)
      VALUES ($1, $2, 'phase3-local-guide', 'Phase 3 integration activity', 'phase3-integration-activity', 3600, 1, 6, 120, 'published', 'published', 'confirm_first', true)
      ON CONFLICT (id) DO NOTHING
    `, [ACTIVITY_ID, GUIDE_ID]);
  });

  after(async () => { await client?.end(); });

  test('P2-C replay retains one request mapping and the canonical inquiry is guide-owned', async () => {
    const tokenHash = sha256(`phase3-token-${randomUUID()}`);
    const { rows: issuedRows } = await client.query(ISSUE_SQL, [
      `PHASE3-${randomUUID().slice(0, 8)}`, GUIDE_ID, ACTIVITY_ID, 'Phase 3 integration activity', 'Local traveler', null, null,
      '2030-09-01', null, 'morning', '09:00', '11:00', 2, null, 'zh-TW', false, null, {}, tokenHash,
    ]);
    const requestId = issuedRows[0].result.request_id;
    const requestHash = sha256(`phase3-request-${randomUUID()}`);
    const first = (await client.query(BRIDGE_SQL, [tokenHash, TRAVELER_ID, `phase3-bridge-${randomUUID()}`, requestHash])).rows[0].result;
    const replay = (await client.query(BRIDGE_SQL, [tokenHash, TRAVELER_ID, `phase3-bridge-${randomUUID()}`, requestHash])).rows[0].result;

    assert.deepEqual({ status: first.status, created: first.created }, { status: 'ok', created: true });
    assert.deepEqual({ status: replay.status, created: replay.created, inquiry_id: replay.inquiry_id }, {
      status: 'ok', created: false, inquiry_id: first.inquiry_id,
    });
    const { rows } = await client.query(`
      SELECT mapping.guide_inquiry_id, inquiry.guide_id, inquiry.status, inquiry.converted_booking_id
      FROM public.midao_request_inquiry_mappings mapping
      JOIN public.guide_inquiries inquiry ON inquiry.id = mapping.guide_inquiry_id
      WHERE mapping.source_request_id = $1
    `, [requestId]);
    assert.deepEqual(rows, [{ guide_inquiry_id: first.inquiry_id, guide_id: GUIDE_ID, status: 'new', converted_booking_id: null }]);
  });
});

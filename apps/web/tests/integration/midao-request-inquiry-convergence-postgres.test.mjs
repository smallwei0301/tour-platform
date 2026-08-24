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
const CONVERT_SQL = `SELECT public.midao_convert_inquiry_to_booking(
  $1::uuid, $2::text, $3::text, $4::uuid, $5::uuid, $6::timestamptz,
  $7::timestamptz, $8::integer, $9::integer, $10::text, $11::integer,
  $12::text, $13::text, $14::text, $15::text, $16::text, $17::text
) AS result`;
const PLAN_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_GUIDE_ID = '66666666-6666-4666-8666-666666666666';

async function createMappedInquiry(client, label) {
  const tokenHash = sha256(`phase3-token-${label}-${randomUUID()}`);
  const { rows: issuedRows } = await client.query(ISSUE_SQL, [
    `PHASE3-${label}-${randomUUID().slice(0, 8)}`, GUIDE_ID, ACTIVITY_ID, 'Phase 3 integration activity',
    'Original traveler', 'original-line', 'original@example.invalid', '2030-09-01', null,
    'morning', '09:00', '11:00', 2, 'original party note', 'zh-TW', false, 'original source note',
    JSON.stringify([{ question_id: 'source_snapshot', value: 'original' }]), tokenHash,
  ]);
  const requestId = issuedRows[0].result.request_id;
  const bridged = (await client.query(BRIDGE_SQL, [
    tokenHash, TRAVELER_ID, `phase3-bridge-${label}-${randomUUID()}`, sha256(`phase3-request-${label}-${randomUUID()}`),
  ])).rows[0].result;
  assert.deepEqual({ status: bridged.status, created: bridged.created }, { status: 'ok', created: true });
  await client.query("UPDATE public.guide_inquiries SET status = 'replied' WHERE id = $1", [bridged.inquiry_id]);
  return { requestId, inquiryId: bridged.inquiry_id };
}

async function convert(client, {
  inquiryId,
  guideId = GUIDE_ID,
  date = '2030-09-01',
  participants = 2,
  idempotencyKey = `phase3-convert-${randomUUID()}`,
  requestHash = sha256(`phase3-convert-request-${randomUUID()}`),
  tokenHash = sha256(`phase3-confirmation-${randomUUID()}`),
} = {}) {
  const { rows } = await client.query(CONVERT_SQL, [
    guideId, 'guide', GUIDE_USER_ID, inquiryId, PLAN_ID,
    `${date}T01:00:00.000Z`, `${date}T05:00:00.000Z`, participants, participants * 1800,
    'canonical guide note', 24, tokenHash, 'Canonical traveler', null, 'canonical@example.invalid',
    idempotencyKey, requestHash,
  ]);
  return rows[0].result;
}

async function conversionEffects(client, inquiryId) {
  const { rows } = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.bookings b WHERE b.source_inquiry_id = $1) AS bookings,
      (SELECT count(*)::int FROM public.orders o JOIN public.bookings b ON b.order_id = o.id WHERE b.source_inquiry_id = $1) AS orders,
      (SELECT count(*)::int FROM public.booking_pricing_snapshots p JOIN public.bookings b ON b.id = p.booking_id WHERE b.source_inquiry_id = $1) AS pricing,
      (SELECT count(*)::int FROM public.booking_intake_responses i JOIN public.bookings b ON b.id = i.booking_id WHERE b.source_inquiry_id = $1) AS intake,
      (SELECT count(*)::int FROM public.booking_confirmation_tokens t JOIN public.bookings b ON b.id = t.booking_id WHERE b.source_inquiry_id = $1) AS tokens,
      (SELECT count(*)::int FROM public.midao_idempotency_records r WHERE r.scope_type = 'inquiry' AND r.scope_id = $1 AND r.command_name = 'convert_inquiry_to_booking') AS idempotency
  `, [inquiryId]);
  return rows[0];
}

describeLocal('midao request-to-inquiry convergence local PostgreSQL contract', () => {
  let client;
  let raceClient;

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
    await client.query(`
      INSERT INTO public.activity_plans (
        id, activity_id, name, slug, duration_minutes, price_type, base_price,
        min_participants, max_participants, booking_type, status
      ) VALUES ($1, $2, 'Phase 3 request plan', 'phase3-request-plan', 120, 'per_person', 1800, 1, 6, 'request', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [PLAN_ID, ACTIVITY_ID]);
    raceClient = new pg.Client({ connectionString: DATABASE_URL });
    await raceClient.connect();
    await raceClient.query("SET statement_timeout = '30s'");
  });

  after(async () => { await Promise.allSettled([client?.end(), raceClient?.end()].filter(Boolean)); });

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

  test('canonical conversion replays only the same key, rejects a second key, and persists immutable inquiry snapshots after source mutation', async () => {
    const mapped = await createMappedInquiry(client, 'replay-snapshots');
    const { rows: inquiryBeforeRows } = await client.query(`
      SELECT questionnaire_snapshot, answers, traveler_note
      FROM public.guide_inquiries WHERE id = $1
    `, [mapped.inquiryId]);
    const inquiryBefore = inquiryBeforeRows[0];
    await client.query(`
      UPDATE public.midao_requests
      SET traveler_name = 'Mutated traveler', preferred_date = '2031-01-01', special_note = 'mutated source note', answers = '[{"question_id":"source_snapshot","value":"mutated"}]'::jsonb
      WHERE id = $1
    `, [mapped.requestId]);

    const idempotencyKey = `phase3-replay-${randomUUID()}`;
    const requestHash = sha256(`phase3-replay-request-${randomUUID()}`);
    const tokenHash = sha256(`phase3-replay-token-${randomUUID()}`);
    const created = await convert(client, {
      inquiryId: mapped.inquiryId, date: '2030-09-10', idempotencyKey, requestHash, tokenHash,
    });
    const replay = await convert(client, {
      inquiryId: mapped.inquiryId, date: '2030-09-10', idempotencyKey, requestHash, tokenHash,
    });

    assert.deepEqual({ created: created.created, replayed: created.replayed }, { created: true, replayed: false });
    assert.deepEqual({ created: replay.created, replayed: replay.replayed, booking_id: replay.booking_id }, {
      created: false, replayed: true, booking_id: created.booking_id,
    });
    await assert.rejects(
      () => convert(client, { inquiryId: mapped.inquiryId, date: '2030-09-10' }),
      (error) => error.message.includes('INQUIRY_ALREADY_CONVERTED'),
    );
    assert.deepEqual(await conversionEffects(client, mapped.inquiryId), {
      bookings: 1, orders: 1, pricing: 1, intake: 1, tokens: 1, idempotency: 1,
    });
    const { rows: snapshotRows } = await client.query(`
      SELECT intake.questionnaire_snapshot, intake.answers, booking.customer_note
      FROM public.bookings booking
      JOIN public.booking_intake_responses intake ON intake.booking_id = booking.id
      WHERE booking.source_inquiry_id = $1
    `, [mapped.inquiryId]);
    assert.deepEqual(snapshotRows, [{
      questionnaire_snapshot: inquiryBefore.questionnaire_snapshot,
      answers: inquiryBefore.answers,
      customer_note: null,
    }]);
  });

  test('wrong guide and terminal canonical inquiry states create no conversion residue', async () => {
    const wrongGuide = await createMappedInquiry(client, 'wrong-guide');
    await assert.rejects(
      () => convert(client, { inquiryId: wrongGuide.inquiryId, guideId: OTHER_GUIDE_ID, date: '2030-09-11' }),
      (error) => error.message.includes('INQUIRY_NOT_FOUND'),
    );
    assert.deepEqual(await conversionEffects(client, wrongGuide.inquiryId), {
      bookings: 0, orders: 0, pricing: 0, intake: 0, tokens: 0, idempotency: 0,
    });

    for (const status of ['closed', 'expired']) {
      const terminal = await createMappedInquiry(client, `terminal-${status}`);
      await client.query('UPDATE public.guide_inquiries SET status = $2 WHERE id = $1', [terminal.inquiryId, status]);
      await assert.rejects(
        () => convert(client, { inquiryId: terminal.inquiryId, date: status === 'closed' ? '2030-09-12' : '2030-09-13' }),
        (error) => error.message.includes('INQUIRY_STATE_NOT_CONVERTIBLE'),
      );
      assert.deepEqual(await conversionEffects(client, terminal.inquiryId), {
        bookings: 0, orders: 0, pricing: 0, intake: 0, tokens: 0, idempotency: 0,
      });
    }
  });

  test('capacity race allows one conversion and leaves no partial idempotency record for the rejected contender', async () => {
    const [left, right] = await Promise.all([
      createMappedInquiry(client, 'capacity-left'),
      createMappedInquiry(raceClient, 'capacity-right'),
    ]);
    const results = await Promise.allSettled([
      convert(client, { inquiryId: left.inquiryId, date: '2030-09-14', participants: 4 }),
      convert(raceClient, { inquiryId: right.inquiryId, date: '2030-09-14', participants: 4 }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.message.includes('CAPACITY_EXCEEDED')).length, 1);
    const { rows } = await client.query(`
      SELECT count(booking.id)::int AS bookings, COALESCE(sum(participants), 0)::int AS participants,
        count(*) FILTER (WHERE inquiry.status = 'converted')::int AS converted_inquiries,
        count(*) FILTER (WHERE idem.state = 'completed')::int AS completed_idempotency,
        count(*) FILTER (WHERE idem.state = 'processing')::int AS processing_idempotency
      FROM public.guide_inquiries inquiry
      LEFT JOIN public.bookings booking ON booking.source_inquiry_id = inquiry.id
      LEFT JOIN public.midao_idempotency_records idem
        ON idem.scope_type = 'inquiry' AND idem.scope_id = inquiry.id AND idem.command_name = 'convert_inquiry_to_booking'
      WHERE inquiry.id = ANY($1::uuid[])
    `, [[left.inquiryId, right.inquiryId]]);
    assert.deepEqual(rows[0], {
      bookings: 1, participants: 4, converted_inquiries: 1, completed_idempotency: 1, processing_idempotency: 0,
    });
  });

  test('late confirmation-token failure rolls back booking, order, pricing, intake, token, and idempotency residue', async () => {
    const seed = await createMappedInquiry(client, 'rollback-seed');
    const reusedTokenHash = sha256(`phase3-reused-token-${randomUUID()}`);
    await convert(client, { inquiryId: seed.inquiryId, date: '2030-09-15', tokenHash: reusedTokenHash });

    const rollback = await createMappedInquiry(client, 'rollback-target');
    await assert.rejects(
      () => convert(client, { inquiryId: rollback.inquiryId, date: '2030-09-16', tokenHash: reusedTokenHash }),
      (error) => error.code === '23505',
    );
    assert.deepEqual(await conversionEffects(client, rollback.inquiryId), {
      bookings: 0, orders: 0, pricing: 0, intake: 0, tokens: 0, idempotency: 0,
    });
    const { rows } = await client.query('SELECT status, converted_booking_id FROM public.guide_inquiries WHERE id = $1', [rollback.inquiryId]);
    assert.deepEqual(rows, [{ status: 'replied', converted_booking_id: null }]);
  });
});

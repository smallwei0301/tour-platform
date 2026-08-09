/**
 * #1759 Package 4／Task 39：conversion gateway/API 測試矩陣 T1–T16。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-07-issue1759-task39-conversion-gateway-plan.md
 * §4（介面／錯誤對照）、§6.1（T1–T16）、§8（GREEN_CONDITION）。
 *
 * 本檔一律使用 Supabase fake，禁止連真實 PostgreSQL（那是 Task 38 的
 * midao-inquiry-convert-rpc.test.mjs 的責任）。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createGuideSessionCookies } from '../../src/lib/guide-auth.ts';
import { hashIdempotentRequest } from '../../src/lib/midao/idempotency.ts';
import {
  __resetMidaoInquiryStoreForTest,
  __seedMidaoInquiryForTest,
  __setMidaoInquiryClockForTest,
} from '../../src/lib/midao/db-midao-inquiries.mjs';
import {
  __internal as CONVERT_INTERNAL,
  __resetMidaoBookingConfirmationStoreForTest,
  __seedMidaoInquiryConversionFixtureForTest,
  __setMidaoBookingConfirmationClockForTest,
  __setMidaoConfirmationTokenFactoryForTest,
  convertMidaoInquiryToBookingDb,
} from '../../src/lib/midao/db-midao-booking-confirmations.mjs';
import { SITE_URL } from '../../src/lib/seo/site-metadata.ts';
import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';

const CONVERT_ROUTE_URL = new URL(
  '../../app/api/v2/guide/inquiries/[inquiryId]/commands/convert/route.ts',
  import.meta.url,
);
const MARK_REPLIED_ROUTE_URL = new URL(
  '../../app/api/v2/guide/inquiries/[inquiryId]/commands/mark-replied/route.ts',
  import.meta.url,
);
const CONVERT_ROUTE_PATH = fileURLToPath(CONVERT_ROUTE_URL);
const MARK_REPLIED_ROUTE_PATH = fileURLToPath(MARK_REPLIED_ROUTE_URL);

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INQUIRY_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const TRAVELER_ID = '44444444-4444-4444-8444-444444444444';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';
const ORDER_ID = '66666666-6666-4666-8666-666666666666';
const FIXED_NOW = '2026-08-07T00:00:00.000Z';
const FIXED_RAW_TOKEN = 'f'.repeat(64);
const FIXED_TOKEN_HASH = createHash('sha256').update(FIXED_RAW_TOKEN).digest('hex');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HEX64_PATTERN = /^[0-9a-f]{64}$/u;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+/u;
const PHONE_PATTERN = /\+?\d[\d\s-]{7,}/u;

function commandBody(overrides = {}) {
  return {
    activityPlanId: PLAN_ID,
    startAt: '2026-09-01T02:00:00.000Z',
    endAt: '2026-09-01T06:00:00.000Z',
    participants: 2,
    quotedTotalTwd: 8000,
    confirmationTtlHours: 12,
    ...overrides,
  };
}

function baseCommand(overrides = {}) {
  const body = commandBody(overrides.body);
  delete overrides.body;
  return {
    guideId: GUIDE_ID,
    actorType: 'guide',
    actorId: GUIDE_ID,
    inquiryId: INQUIRY_ID,
    activityPlanId: body.activityPlanId,
    startAt: body.startAt,
    endAt: body.endAt,
    participants: body.participants,
    quotedTotalTwd: body.quotedTotalTwd,
    guideNote: null,
    confirmationTtlHours: body.confirmationTtlHours,
    idempotencyKey: 'convert-key-1',
    requestHash: hashIdempotentRequest(body),
    ...overrides,
  };
}

function seedFixture(overrides = {}) {
  return __seedMidaoInquiryConversionFixtureForTest({
    inquiry: {
      id: INQUIRY_ID,
      guideId: GUIDE_ID,
      activityId: ACTIVITY_ID,
      status: 'replied',
      convertedBookingId: null,
      travelerUserId: TRAVELER_ID,
      ...overrides.inquiry,
    },
    plan: {
      id: PLAN_ID,
      activityId: ACTIVITY_ID,
      guideId: GUIDE_ID,
      bookingType: 'request',
      status: 'active',
      minParticipants: 1,
      maxParticipants: 4,
      ...overrides.plan,
    },
    traveler: {
      id: TRAVELER_ID,
      name: '旅客甲',
      email: 'traveler@example.test',
      ...overrides.traveler,
    },
  });
}

function rpcSuccessPayload(overrides = {}) {
  return {
    created: true,
    replayed: false,
    inquiry_id: INQUIRY_ID,
    booking_id: BOOKING_ID,
    order_id: ORDER_ID,
    booking_no: 'BK-9001',
    booking_status: 'draft',
    traveler_confirmation_status: 'pending',
    traveler_confirmation_expires_at: '2026-08-07T12:00:00.000Z',
    confirmation_token_belongs_to_caller: true,
    ...overrides,
  };
}

function guideProfileRow() {
  return {
    id: GUIDE_ID,
    display_name: 'Canonical Guide',
    backend_mode: 'midao',
    guide_session_version: 7,
    verification_status: 'approved',
  };
}

function inquiryRow(overrides = {}) {
  return {
    id: INQUIRY_ID,
    inquiry_no: 'INQ-0001',
    traveler_user_id: TRAVELER_ID,
    guide_id: GUIDE_ID,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    status: 'new',
    preferred_date: '2026-09-01',
    backup_date: null,
    start_time_local: '10:00',
    party_size: 2,
    language: 'zh-TW',
    pickup_required: false,
    traveler_note: null,
    questionnaire_snapshot: {},
    answers: {},
    last_replied_at: null,
    converted_booking_id: null,
    expires_at: null,
    created_at: FIXED_NOW,
    updated_at: FIXED_NOW,
    ...overrides,
  };
}

/**
 * 單一 Supabase fake：涵蓋 canonical guide session（guide_profiles）、
 * mark-replied（guide_inquiries select/update）與 convert gateway 的查詢與 rpc。
 */
function createSupabaseFake({
  rpcData = null,
  rpcError = null,
  inquiry = null,
  plan = null,
  activityGuideId = GUIDE_ID,
  traveler = { name: '旅客甲', email: 'traveler@example.test' },
  guideProfile = guideProfileRow(),
} = {}) {
  const calls = [];
  const tables = [];
  let storedInquiry = inquiry ? { ...inquiry } : null;

  function selectBuilder(rowResolver) {
    const filters = {};
    const query = {
      select() { return query; },
      eq(field, value) {
        filters[field] = value;
        return query;
      },
      async maybeSingle() {
        return rowResolver(filters);
      },
      async single() {
        const result = rowResolver(filters);
        if (!result.data) return { data: null, error: { code: 'PGRST116' } };
        return result;
      },
    };
    return query;
  }

  const client = {
    from(table) {
      tables.push(table);
      if (table === 'guide_profiles') {
        return selectBuilder(() => ({ data: guideProfile, error: null }));
      }
      if (table === 'guide_inquiries') {
        const builder = {
          select() { return builder; },
          update(patch) {
            builder.__patch = patch;
            return builder;
          },
          eq(field, value) {
            builder.__filters = { ...(builder.__filters || {}), [field]: value };
            return builder;
          },
          async maybeSingle() {
            const filters = builder.__filters || {};
            if (!storedInquiry) return { data: null, error: null };
            if (filters.id && filters.id !== storedInquiry.id) return { data: null, error: null };
            if (filters.guide_id && filters.guide_id !== storedInquiry.guide_id) {
              return { data: null, error: null };
            }
            if (filters.status && filters.status !== storedInquiry.status) {
              return { data: null, error: null };
            }
            if (builder.__patch) {
              storedInquiry = { ...storedInquiry, ...builder.__patch };
              return { data: { ...storedInquiry }, error: null };
            }
            return { data: { ...storedInquiry }, error: null };
          },
        };
        return builder;
      }
      if (table === 'activity_plans') {
        return selectBuilder((filters) => ({
          data: plan && filters.id === plan.id ? plan : null,
          error: null,
        }));
      }
      if (table === 'activities') {
        return selectBuilder(() => ({
          data: activityGuideId === null ? null : { guide_id: activityGuideId },
          error: null,
        }));
      }
      if (table === 'users') {
        return selectBuilder(() => ({ data: traveler, error: null }));
      }
      throw new Error(`unexpected table ${table}`);
    },
    async rpc(name, args) {
      calls.push({ name, args: structuredClone(args) });
      return { data: rpcData ? structuredClone(rpcData) : null, error: rpcError };
    },
  };
  return { client, calls, tables, inquiryState: () => storedInquiry };
}

function useSupabase(fake) {
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(fake.client);
  return fake;
}

function sessionCookieHeader(guideId = GUIDE_ID) {
  return createGuideSessionCookies(guideId, 'Canonical Guide', 7)
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ');
}

function routeRequest(path, body, { idempotencyKey = 'convert-key-1', csrf = 'csrf-value' } = {}) {
  return new Request(`https://example.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${sessionCookieHeader()}; tp_csrf=${csrf}`,
      'x-csrf-token': csrf,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

async function postConvert(body, options = {}, inquiryId = INQUIRY_ID) {
  const route = await import(CONVERT_ROUTE_URL);
  const request = routeRequest(
    `/api/v2/guide/inquiries/${inquiryId}/commands/convert`,
    body,
    options,
  );
  return route.POST(request, { params: Promise.resolve({ inquiryId }) });
}

async function postMarkReplied(body, options = {}, inquiryId = INQUIRY_ID) {
  const route = await import(MARK_REPLIED_ROUTE_URL);
  const request = routeRequest(
    `/api/v2/guide/inquiries/${inquiryId}/commands/mark-replied`,
    body,
    options,
  );
  return route.POST(request, { params: Promise.resolve({ inquiryId }) });
}

async function responseJson(response) {
  return { status: response.status, body: await response.json() };
}

test.beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.GUIDE_SESSION_SECRET = 'task39-test-guide-session-secret-0123456789';
  process.env.MIDAO_BACKEND_ENABLED = '1';
  process.env.MIDAO_BACKEND_MUTATIONS_ENABLED = '1';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  __resetMidaoBookingConfirmationStoreForTest();
  __resetMidaoInquiryStoreForTest();
  __setMidaoBookingConfirmationClockForTest(() => FIXED_NOW);
  __setMidaoInquiryClockForTest(() => FIXED_NOW);
  __setMidaoConfirmationTokenFactoryForTest(() => FIXED_RAW_TOKEN);
});

test.afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.MIDAO_BACKEND_ENABLED;
  delete process.env.MIDAO_BACKEND_MUTATIONS_ENABLED;
  __setSupabaseClientForTest(null);
  __resetMidaoBookingConfirmationStoreForTest();
  __resetMidaoInquiryStoreForTest();
  __setMidaoBookingConfirmationClockForTest(null);
  __setMidaoInquiryClockForTest(null);
  __setMidaoConfirmationTokenFactoryForTest(null);
});

// ---------------------------------------------------------------------------
// T1：in-memory 正常轉換
// ---------------------------------------------------------------------------
test('T1 in-memory conversion returns the fixed created projection with a one-time confirmation token', async () => {
  seedFixture();
  const result = await convertMidaoInquiryToBookingDb(baseCommand());

  assert.deepEqual(Object.keys(result).sort(), [
    'bookingId',
    'bookingNo',
    'bookingStatus',
    'confirmationToken',
    'confirmationTokenNote',
    'confirmationUrl',
    'created',
    'inquiryId',
    'orderId',
    'replayed',
    'travelerConfirmationExpiresAt',
    'travelerConfirmationStatus',
  ]);
  assert.equal(result.created, true);
  assert.equal(result.replayed, false);
  assert.equal(result.inquiryId, INQUIRY_ID);
  assert.match(result.bookingId, UUID_PATTERN);
  assert.match(result.orderId, UUID_PATTERN);
  assert.equal(result.bookingStatus, 'draft');
  assert.equal(result.travelerConfirmationStatus, 'pending');
  assert.equal(result.travelerConfirmationExpiresAt, '2026-08-07T12:00:00.000Z');
  assert.match(result.confirmationToken, HEX64_PATTERN);
  assert.equal(result.confirmationToken, FIXED_RAW_TOKEN);
  assert.equal(result.confirmationUrl, `${SITE_URL}/booking/confirm/${FIXED_RAW_TOKEN}`);
  assert.equal(typeof result.confirmationTokenNote, 'string');
  assert.equal(result.confirmationTokenNote.length > 0, true);
});

// ---------------------------------------------------------------------------
// T2：replay 一次性 token
// ---------------------------------------------------------------------------
test('T2 replaying the same idempotency key returns the same booking with a null confirmation token', async () => {
  seedFixture();
  const first = await convertMidaoInquiryToBookingDb(baseCommand());
  const replay = await convertMidaoInquiryToBookingDb(baseCommand());

  assert.equal(replay.created, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.bookingId, first.bookingId);
  assert.equal(replay.orderId, first.orderId);
  assert.equal(replay.confirmationToken, null);
  assert.equal(replay.confirmationUrl, null);
  assert.notEqual(replay.confirmationTokenNote, first.confirmationTokenNote);
});

// ---------------------------------------------------------------------------
// T2b：raw token 不入庫
// ---------------------------------------------------------------------------
test('T2b only the sha256 hash is persisted or sent to the RPC, never the raw token', async () => {
  seedFixture();
  await convertMidaoInquiryToBookingDb(baseCommand());
  const stores = CONVERT_INTERNAL.inspectStoresForTest();
  const storeDump = JSON.stringify(stores);
  assert.equal(storeDump.includes(FIXED_RAW_TOKEN), false);
  assert.equal(storeDump.includes(FIXED_TOKEN_HASH), true);

  __resetMidaoBookingConfirmationStoreForTest();
  const fake = useSupabase(createSupabaseFake({
    rpcData: rpcSuccessPayload(),
    inquiry: inquiryRow({ status: 'replied' }),
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      booking_type: 'request',
      status: 'active',
      min_participants: 1,
      max_participants: 4,
    },
  }));
  await convertMidaoInquiryToBookingDb(baseCommand());
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].name, 'midao_convert_inquiry_to_booking');
  const args = fake.calls[0].args;
  assert.notEqual(args.p_confirmation_token_hash, FIXED_RAW_TOKEN);
  assert.equal(args.p_confirmation_token_hash, FIXED_TOKEN_HASH);
  assert.equal(JSON.stringify(args).includes(FIXED_RAW_TOKEN), false);
  assert.equal(args.p_contact_phone, null);
  assert.equal(args.p_contact_name, '旅客甲');
  assert.equal(args.p_contact_email, 'traveler@example.test');
  assert.equal(args.p_guide_id, GUIDE_ID);
  assert.equal(args.p_inquiry_id, INQUIRY_ID);
  assert.equal(args.p_activity_plan_id, PLAN_ID);
  assert.equal(args.p_idempotency_key, 'convert-key-1');
});

// ---------------------------------------------------------------------------
// T3 / T3b：重複轉換
// ---------------------------------------------------------------------------
test('T3 an inquiry that already has a converted booking is rejected as already converted', async () => {
  seedFixture({ inquiry: { convertedBookingId: BOOKING_ID } });
  await assert.rejects(
    () => convertMidaoInquiryToBookingDb(baseCommand({ idempotencyKey: 'convert-key-fresh' })),
    (error) => error.code === 'INQUIRY_ALREADY_CONVERTED' && error.status === 409,
  );
});

test('T3b RPC already-converted errors stay 409 and never leak the existing booking id', async () => {
  useSupabase(createSupabaseFake({
    rpcError: { code: 'P0001', message: 'INQUIRY_ALREADY_CONVERTED', details: `{"bookingId":"${BOOKING_ID}"}` },
    inquiry: inquiryRow({ status: 'replied' }),
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      booking_type: 'request',
      status: 'active',
      min_participants: 1,
      max_participants: 4,
    },
  }));
  await assert.rejects(
    () => convertMidaoInquiryToBookingDb(baseCommand()),
    (error) => error.code === 'INQUIRY_ALREADY_CONVERTED'
      && error.status === 409
      && !error.message.includes(BOOKING_ID),
  );
});

// ---------------------------------------------------------------------------
// T4 / T4b：歸屬錯誤塌成 404
// ---------------------------------------------------------------------------
test('T4 another guide inquiry collapses to a sanitized 404 without exposing the mismatch code', async () => {
  seedFixture({ inquiry: { guideId: OTHER_GUIDE_ID } });
  await assert.rejects(
    () => convertMidaoInquiryToBookingDb(baseCommand()),
    (error) => error.code === 'NOT_FOUND'
      && error.status === 404
      && error.message === 'Resource not found'
      && !error.message.includes('INQUIRY_GUIDE_MISMATCH'),
  );
});

test('T4b RPC plan-guide mismatch also collapses to a sanitized 404', async () => {
  useSupabase(createSupabaseFake({
    rpcError: { code: 'P0001', message: 'PLAN_GUIDE_MISMATCH' },
    inquiry: inquiryRow({ status: 'replied' }),
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      booking_type: 'request',
      status: 'active',
      min_participants: 1,
      max_participants: 4,
    },
  }));
  await assert.rejects(
    () => convertMidaoInquiryToBookingDb(baseCommand()),
    (error) => error.code === 'NOT_FOUND' && error.status === 404 && error.message === 'Resource not found',
  );
});

// ---------------------------------------------------------------------------
// T5 / T5b：狀態不可轉換 / 方案下架
// ---------------------------------------------------------------------------
test('T5 closed and expired inquiries are rejected as not convertible', async () => {
  for (const status of ['closed', 'expired']) {
    __resetMidaoBookingConfirmationStoreForTest();
    seedFixture({ inquiry: { status } });
    await assert.rejects(
      () => convertMidaoInquiryToBookingDb(baseCommand()),
      (error) => error.code === 'INQUIRY_STATE_NOT_CONVERTIBLE' && error.status === 409,
      `status=${status}`,
    );
  }
});

test('T5b an inactive plan is rejected as plan inactive', async () => {
  seedFixture({ plan: { status: 'inactive' } });
  await assert.rejects(
    () => convertMidaoInquiryToBookingDb(baseCommand()),
    (error) => error.code === 'PLAN_INACTIVE' && error.status === 409,
  );
});

// ---------------------------------------------------------------------------
// T6：容量衝突
// ---------------------------------------------------------------------------
test('T6 capacity exhaustion is rejected in-memory and through the RPC error mapping', async () => {
  seedFixture({ plan: { maxParticipants: 3 } });
  await convertMidaoInquiryToBookingDb(baseCommand());
  __seedMidaoInquiryConversionFixtureForTest({
    inquiry: {
      id: INQUIRY_ID,
      guideId: GUIDE_ID,
      activityId: ACTIVITY_ID,
      status: 'replied',
      convertedBookingId: null,
      travelerUserId: TRAVELER_ID,
    },
    plan: {
      id: PLAN_ID,
      activityId: ACTIVITY_ID,
      guideId: GUIDE_ID,
      bookingType: 'request',
      status: 'active',
      minParticipants: 1,
      maxParticipants: 3,
    },
    traveler: { id: TRAVELER_ID, name: '旅客甲', email: 'traveler@example.test' },
  });
  await assert.rejects(
    () => convertMidaoInquiryToBookingDb(baseCommand({ idempotencyKey: 'convert-key-2' })),
    (error) => error.code === 'CAPACITY_EXCEEDED' && error.status === 409,
  );

  __resetMidaoBookingConfirmationStoreForTest();
  useSupabase(createSupabaseFake({
    rpcError: { code: 'P0001', message: 'CAPACITY_EXCEEDED' },
    inquiry: inquiryRow({ status: 'replied' }),
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      booking_type: 'request',
      status: 'active',
      min_participants: 1,
      max_participants: 4,
    },
  }));
  await assert.rejects(
    () => convertMidaoInquiryToBookingDb(baseCommand()),
    (error) => error.code === 'CAPACITY_EXCEEDED' && error.status === 409,
  );
});

// ---------------------------------------------------------------------------
// T7 / T7b / T7c：Task 37 純函式先擋，且不打 RPC
// ---------------------------------------------------------------------------
test('T7 an invalid quote is rejected by the pure validator before any RPC call', async () => {
  const fake = useSupabase(createSupabaseFake({
    rpcData: rpcSuccessPayload(),
    inquiry: inquiryRow({ status: 'replied' }),
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      booking_type: 'request',
      status: 'active',
      min_participants: 1,
      max_participants: 4,
    },
  }));
  await assert.rejects(
    () => convertMidaoInquiryToBookingDb(baseCommand({ quotedTotalTwd: -1 })),
    (error) => error.code === 'INVALID_QUOTED_TOTAL'
      && error.status === 422
      && error.message === '報價總額必須是零或正整數（新台幣元）。',
  );
  assert.equal(fake.calls.length, 0);
});

test('T7b an out-of-bounds TTL is rejected before any RPC call', async () => {
  const fake = useSupabase(createSupabaseFake({
    rpcData: rpcSuccessPayload(),
    inquiry: inquiryRow({ status: 'replied' }),
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      booking_type: 'request',
      status: 'active',
      min_participants: 1,
      max_participants: 4,
    },
  }));
  await assert.rejects(
    () => convertMidaoInquiryToBookingDb(baseCommand({ confirmationTtlHours: 48 })),
    (error) => error.code === 'TTL_OUT_OF_BOUNDS' && error.status === 422,
  );
  assert.equal(fake.calls.length, 0);
});

test('T7c validation messages never carry uuid, email or phone identifiers', async () => {
  seedFixture();
  const cases = [
    baseCommand({ quotedTotalTwd: -1 }),
    baseCommand({ confirmationTtlHours: 48 }),
    baseCommand({ participants: 0 }),
    baseCommand({ startAt: 'not-a-timestamp' }),
  ];
  for (const command of cases) {
    await assert.rejects(
      () => convertMidaoInquiryToBookingDb(command),
      (error) => {
        assert.equal(error.status, 422);
        assert.doesNotMatch(error.message, UUID_PATTERN);
        assert.doesNotMatch(error.message, EMAIL_PATTERN);
        assert.doesNotMatch(error.message, PHONE_PATTERN);
        return true;
      },
    );
  }
});

// ---------------------------------------------------------------------------
// T8：失敗不留殘留
// ---------------------------------------------------------------------------
test('T8 a failed conversion leaves no booking, order, token or idempotency residue', async () => {
  seedFixture({ plan: { maxParticipants: 1 } });
  await assert.rejects(
    () => convertMidaoInquiryToBookingDb(baseCommand({ participants: 2 })),
    (error) => error.status === 422 || error.status === 409,
  );
  const stores = CONVERT_INTERNAL.inspectStoresForTest();
  assert.deepEqual(stores.bookings, []);
  assert.deepEqual(stores.orders, []);
  assert.deepEqual(stores.confirmationTokens, []);
  assert.deepEqual(stores.idempotency, []);

  const fake = useSupabase(createSupabaseFake({
    rpcError: { code: 'XX000', message: 'transaction aborted: password email leaked' },
    inquiry: inquiryRow({ status: 'replied' }),
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      booking_type: 'request',
      status: 'active',
      min_participants: 1,
      max_participants: 4,
    },
  }));
  await assert.rejects(
    () => convertMidaoInquiryToBookingDb(baseCommand()),
    (error) => error.code === undefined
      && !error.message.includes('password')
      && !error.message.includes('email'),
  );
  assert.equal(fake.calls.length, 1);
  const afterRpcFailure = CONVERT_INTERNAL.inspectStoresForTest();
  assert.deepEqual(afterRpcFailure.bookings, []);
  assert.deepEqual(afterRpcFailure.confirmationTokens, []);
});

test('T8b the 22023 input-format RPC family is reported as an internal error, not a 422', async () => {
  for (const message of ['INVALID_CONFIRMATION_TOKEN_HASH', 'END_NOT_AFTER_START', 'TTL_OUT_OF_BOUNDS']) {
    useSupabase(createSupabaseFake({
      rpcError: { code: '22023', message },
      inquiry: inquiryRow({ status: 'replied' }),
      plan: {
        id: PLAN_ID,
        activity_id: ACTIVITY_ID,
        booking_type: 'request',
        status: 'active',
        min_participants: 1,
        max_participants: 4,
      },
    }));
    await assert.rejects(
      () => convertMidaoInquiryToBookingDb(baseCommand()),
      (error) => error.code === undefined && error.status === undefined,
      message,
    );
  }
});

// ---------------------------------------------------------------------------
// T9 / T10：route 結構與 wiring
// ---------------------------------------------------------------------------
test('T9 both routes go through withMidaoGuideCommand and never touch bookings or orders directly', () => {
  assert.equal(existsSync(CONVERT_ROUTE_PATH), true, `missing convert route: ${CONVERT_ROUTE_PATH}`);
  assert.equal(existsSync(MARK_REPLIED_ROUTE_PATH), true, `missing mark-replied route: ${MARK_REPLIED_ROUTE_PATH}`);
  const convertSource = readFileSync(CONVERT_ROUTE_PATH, 'utf8');
  const markRepliedSource = readFileSync(MARK_REPLIED_ROUTE_PATH, 'utf8');

  assert.match(convertSource, /withMidaoGuideCommand/u);
  assert.match(markRepliedSource, /withMidaoGuideCommand/u);
  assert.doesNotMatch(convertSource, /from\('bookings'\)|from\('orders'\)/u);
  assert.doesNotMatch(markRepliedSource, /from\('bookings'\)|from\('orders'\)/u);
});

test('T10 both routes export a POST handler', async () => {
  const convertRoute = await import(CONVERT_ROUTE_URL);
  const markRepliedRoute = await import(MARK_REPLIED_ROUTE_URL);
  assert.equal(typeof convertRoute.POST, 'function');
  assert.equal(typeof markRepliedRoute.POST, 'function');
  assert.match(readFileSync(CONVERT_ROUTE_PATH, 'utf8'), /export async function POST|export const POST/u);
  assert.match(readFileSync(MARK_REPLIED_ROUTE_PATH, 'utf8'), /export async function POST|export const POST/u);
});

test('T10b the convert route returns the gateway projection through jsonOk', async () => {
  useSupabase(createSupabaseFake({
    rpcData: rpcSuccessPayload(),
    inquiry: inquiryRow({ status: 'replied' }),
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      booking_type: 'request',
      status: 'active',
      min_participants: 1,
      max_participants: 4,
    },
  }));
  const payload = await responseJson(await postConvert(commandBody()));
  assert.equal(payload.status, 200);
  assert.equal(payload.body.success, true);
  assert.equal(payload.body.data.created, true);
  assert.equal(payload.body.data.bookingId, BOOKING_ID);
  assert.equal(payload.body.data.confirmationToken, FIXED_RAW_TOKEN);
});

test('T10c the convert route rejects unknown body keys before the gateway', async () => {
  const fake = useSupabase(createSupabaseFake({
    rpcData: rpcSuccessPayload(),
    inquiry: inquiryRow({ status: 'replied' }),
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      booking_type: 'request',
      status: 'active',
      min_participants: 1,
      max_participants: 4,
    },
  }));
  const payload = await responseJson(await postConvert(commandBody({ extra: true })));
  assert.equal(payload.status, 422);
  assert.equal(payload.body.error.code, 'INVALID_REQUEST_BODY');
  assert.equal(fake.calls.length, 0);
});

// ---------------------------------------------------------------------------
// T11：mutation flag
// ---------------------------------------------------------------------------
test('T11 the convert route returns 503 MUTATIONS_DISABLED when midao mutations are off', async () => {
  const fake = useSupabase(createSupabaseFake({
    rpcData: rpcSuccessPayload(),
    inquiry: inquiryRow({ status: 'replied' }),
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      booking_type: 'request',
      status: 'active',
      min_participants: 1,
      max_participants: 4,
    },
  }));
  process.env.MIDAO_BACKEND_MUTATIONS_ENABLED = '0';
  const payload = await responseJson(await postConvert(commandBody()));
  assert.equal(payload.status, 503);
  assert.equal(payload.body.error.code, 'MUTATIONS_DISABLED');
  assert.equal(fake.calls.length, 0);
});

// ---------------------------------------------------------------------------
// T12 / T13 / T14 / T15：mark-replied route
// ---------------------------------------------------------------------------
test('T12 mark-replied moves a new inquiry to replied and stamps lastRepliedAt', async () => {
  useSupabase(createSupabaseFake({ inquiry: inquiryRow({ status: 'new' }) }));
  const payload = await responseJson(await postMarkReplied({}));
  assert.equal(payload.status, 200);
  assert.equal(payload.body.success, true);
  assert.equal(payload.body.data.inquiry.status, 'replied');
  assert.equal(payload.body.data.inquiry.lastRepliedAt, FIXED_NOW);
});

test('T13 mark-replied on another guide inquiry collapses to a sanitized 404', async () => {
  useSupabase(createSupabaseFake({ inquiry: inquiryRow({ status: 'new', guide_id: OTHER_GUIDE_ID }) }));
  const payload = await responseJson(await postMarkReplied({}));
  assert.equal(payload.status, 404);
  assert.deepEqual(payload.body.error, { code: 'NOT_FOUND', message: 'Resource not found' });
});

test('T14 mark-replied on a converted inquiry is rejected as an invalid state', async () => {
  useSupabase(createSupabaseFake({
    inquiry: inquiryRow({ status: 'converted', converted_booking_id: BOOKING_ID }),
  }));
  const payload = await responseJson(await postMarkReplied({}));
  assert.equal(payload.status, 409);
  assert.equal(payload.body.error.code, 'INVALID_INQUIRY_STATE');
});

test('T15 mark-replied requires a strictly empty body', async () => {
  useSupabase(createSupabaseFake({ inquiry: inquiryRow({ status: 'new' }) }));
  const payload = await responseJson(await postMarkReplied({ foo: 1 }));
  assert.equal(payload.status, 422);
  assert.equal(payload.body.error.code, 'INVALID_REQUEST_BODY');
});

// ---------------------------------------------------------------------------
// T16：不重造 gateway
// ---------------------------------------------------------------------------
test('T16 mark-replied reuses the existing markMidaoInquiryRepliedDb gateway', () => {
  const source = readFileSync(MARK_REPLIED_ROUTE_PATH, 'utf8');
  assert.match(source, /markMidaoInquiryRepliedDb/u);
  assert.doesNotMatch(source, /db-midao-booking-confirmations/u);
});

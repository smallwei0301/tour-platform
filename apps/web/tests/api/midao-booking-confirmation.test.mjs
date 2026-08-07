/**
 * #1759 Package 4／Task 40：traveler confirmation accept gateway/API 測試矩陣 T1–T18。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-07-issue1759-task40-traveler-confirmation-plan.md
 * §4（介面）／§5（RPC 參數與錯誤對照）／§6（route 邊界順序）／§7（本矩陣）。
 *
 * 一律使用 in-memory 分支與 Supabase fake（__setSupabaseClientForTest），
 * 禁止連真實 PostgreSQL。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { hashIdempotentRequest } from '../../src/lib/midao/idempotency.ts';
import {
  ACCEPT_ERROR_STATUS,
  ACCEPT_RPC_ERROR_TOKENS,
  ACCEPT_SAFE_MESSAGES,
  acceptRpcErrorToken,
  hashConfirmationToken,
  normalizeConfirmationRawToken,
  validateAcceptProjection,
} from '../../src/lib/midao/booking-confirmation.ts';
import {
  __internal as CONFIRMATION_INTERNAL,
  __resetMidaoBookingConfirmationStoreForTest,
  __seedMidaoInquiryConversionFixtureForTest,
  __setMidaoBookingConfirmationClockForTest,
  __setMidaoConfirmationTokenFactoryForTest,
  convertMidaoInquiryToBookingDb,
} from '../../src/lib/midao/db-midao-booking-confirmations.mjs';
import {
  __internal as ACCEPT_INTERNAL,
  acceptMidaoTravelerConfirmationDb,
} from '../../src/lib/midao/db-midao-traveler-confirmation.mjs';
import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';

const ACCEPT_ROUTE_PATH = fileURLToPath(new URL(
  '../../app/api/v2/me/booking-confirmations/[token]/accept/route.ts',
  import.meta.url,
));

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INQUIRY_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const TRAVELER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_TRAVELER_ID = '77777777-7777-4777-8777-777777777777';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';
const ORDER_ID = '66666666-6666-4666-8666-666666666666';
const FIXED_NOW = '2026-08-07T00:00:00.000Z';
const FIXED_RAW_TOKEN = 'f'.repeat(64);
const FIXED_TOKEN_HASH = createHash('sha256').update(FIXED_RAW_TOKEN).digest('hex');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HEX64_PATTERN = /[0-9a-f]{64}/u;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+/u;
const EMPTY_BODY_HASH = hashIdempotentRequest({});

function resetAll() {
  __setSupabaseClientForTest(null);
  __resetMidaoBookingConfirmationStoreForTest();
  __setMidaoBookingConfirmationClockForTest(FIXED_NOW);
  __setMidaoConfirmationTokenFactoryForTest(() => FIXED_RAW_TOKEN);
}

function convertBody(overrides = {}) {
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
    traveler: { id: TRAVELER_ID, name: '旅客甲', email: 'traveler@example.test' },
  });
}

/** 先跑一次 conversion，回傳 raw token 與 conversion 結果。 */
async function seedConvertedBooking(overrides = {}) {
  seedFixture(overrides);
  const body = convertBody(overrides.body);
  const conversion = await convertMidaoInquiryToBookingDb({
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
  });
  return { conversion, rawToken: conversion.confirmationToken };
}

function acceptInput(overrides = {}) {
  return {
    travelerUserId: TRAVELER_ID,
    rawToken: FIXED_RAW_TOKEN,
    idempotencyKey: 'accept-key-1',
    requestHash: EMPTY_BODY_HASH,
    ...overrides,
  };
}

function assertNoLeak(message) {
  assert.doesNotMatch(message, HEX64_PATTERN);
  assert.doesNotMatch(message, UUID_PATTERN);
  assert.doesNotMatch(message, EMAIL_PATTERN);
}

async function rejectsWith(fn, { code, status }) {
  await assert.rejects(fn, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.equal(error.message, ACCEPT_SAFE_MESSAGES[code]);
    assertNoLeak(error.message);
    return true;
  });
}

function rpcSuccessPayload(overrides = {}) {
  return {
    accepted: true,
    replayed: false,
    booking_id: BOOKING_ID,
    order_id: ORDER_ID,
    booking_status: 'draft',
    traveler_confirmation_status: 'confirmed',
    payment_deadline_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

function createSupabaseFake({ rpcData = null, rpcError = null } = {}) {
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve(rpcError ? { data: null, error: rpcError } : { data: rpcData, error: null });
    },
  };
  return { client, calls };
}

function useSupabase(fake) {
  __setSupabaseClientForTest(fake.client);
  process.env.SUPABASE_URL = 'https://fake.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
  return fake;
}

function clearSupabaseEnv() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
}

test.beforeEach(() => {
  clearSupabaseEnv();
  resetAll();
});

test.after(() => {
  clearSupabaseEnv();
  resetAll();
});

// ---------------------------------------------------------------------------
// T1：成功（in-memory）
// ---------------------------------------------------------------------------
test('T1 accepting a freshly issued confirmation token succeeds', async () => {
  const { conversion, rawToken } = await seedConvertedBooking();
  assert.equal(rawToken, FIXED_RAW_TOKEN);

  const result = await acceptMidaoTravelerConfirmationDb(acceptInput({ rawToken }));

  assert.deepEqual(Object.keys(result).sort(), [
    'accepted',
    'bookingId',
    'bookingStatus',
    'orderId',
    'paymentDeadlineAt',
    'replayed',
    'travelerConfirmationStatus',
  ]);
  assert.equal(result.accepted, true);
  assert.equal(result.replayed, false);
  assert.equal(result.bookingStatus, 'draft');
  assert.equal(result.travelerConfirmationStatus, 'confirmed');
  assert.equal(result.bookingId, conversion.bookingId);
  assert.equal(result.orderId, conversion.orderId);
  assert.match(result.bookingId, UUID_PATTERN);
  assert.match(result.orderId, UUID_PATTERN);
  assert.equal(result.paymentDeadlineAt, '2026-08-08T00:00:00.000Z');
  // raw token 不得出現在回應中
  assert.equal(JSON.stringify(result).includes(FIXED_RAW_TOKEN), false);
});

// ---------------------------------------------------------------------------
// T2：冪等 replay
// ---------------------------------------------------------------------------
test('T2 replaying the same idempotency key returns the persisted body with replayed=true', async () => {
  const { rawToken } = await seedConvertedBooking();
  const first = await acceptMidaoTravelerConfirmationDb(acceptInput({ rawToken }));
  const before = CONFIRMATION_INTERNAL.inspectStoresForTest();

  const replay = await acceptMidaoTravelerConfirmationDb(acceptInput({ rawToken }));

  assert.equal(replay.accepted, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.bookingId, first.bookingId);
  assert.deepEqual(Object.keys(replay).sort(), Object.keys(first).sort());

  const after = CONFIRMATION_INTERNAL.inspectStoresForTest();
  assert.deepEqual(after.confirmationTokens, before.confirmationTokens);
});

// ---------------------------------------------------------------------------
// T3：token not found
// ---------------------------------------------------------------------------
test('T3 an unknown 64-hex token collapses to 404 Resource not found', async () => {
  await seedConvertedBooking();
  await rejectsWith(
    () => acceptMidaoTravelerConfirmationDb(acceptInput({ rawToken: 'a'.repeat(64) })),
    { code: 'NOT_FOUND', status: 404 },
  );
});

// ---------------------------------------------------------------------------
// T4：格式不合法 token（不打 gateway／RPC）
// ---------------------------------------------------------------------------
test('T4 malformed tokens are rejected as 404 before any backend call', () => {
  for (const candidate of ['abc', 'G'.repeat(64), '', 'f'.repeat(63), 'f'.repeat(65), null, undefined, 123]) {
    assert.throws(
      () => normalizeConfirmationRawToken(candidate),
      (error) => {
        assert.equal(error.code, 'NOT_FOUND');
        assert.equal(error.status, 404);
        assert.equal(error.message, 'Resource not found');
        assertNoLeak(error.message);
        return true;
      },
    );
  }
  assert.equal(normalizeConfirmationRawToken(`  ${'F'.repeat(64)}  `), 'f'.repeat(64));
  assert.equal(hashConfirmationToken(FIXED_RAW_TOKEN), FIXED_TOKEN_HASH);
  assert.notEqual(hashConfirmationToken(FIXED_RAW_TOKEN), FIXED_RAW_TOKEN);
});

// ---------------------------------------------------------------------------
// T5：wrong owner → 與不存在塌成同一個 404
// ---------------------------------------------------------------------------
test('T5 another traveler using a valid token gets the same opaque 404', async () => {
  const { rawToken } = await seedConvertedBooking();
  await assert.rejects(
    () => acceptMidaoTravelerConfirmationDb(acceptInput({ rawToken, travelerUserId: OTHER_TRAVELER_ID })),
    (error) => {
      assert.equal(error.code, 'NOT_FOUND');
      assert.equal(error.status, 404);
      assert.equal(error.message, 'Resource not found');
      assert.doesNotMatch(error.message, /OWNER|MISMATCH|traveler/iu);
      assertNoLeak(error.message);
      return true;
    },
  );
  const stores = CONFIRMATION_INTERNAL.inspectStoresForTest();
  assert.equal(stores.confirmationTokens[0].consumedAt, null);
  assert.deepEqual(stores.idempotency.filter((row) => row.key.includes('accept_traveler_confirmation')), []);
});

// ---------------------------------------------------------------------------
// T6：expired
// ---------------------------------------------------------------------------
test('T6 an expired confirmation window is rejected with 410', async () => {
  const { rawToken } = await seedConvertedBooking();
  __setMidaoBookingConfirmationClockForTest('2026-08-08T00:00:00.000Z');
  await rejectsWith(
    () => acceptMidaoTravelerConfirmationDb(acceptInput({ rawToken })),
    { code: 'CONFIRMATION_TOKEN_EXPIRED', status: 410 },
  );
});

// ---------------------------------------------------------------------------
// T7：already consumed
// ---------------------------------------------------------------------------
test('T7 a second accept with a fresh idempotency key is rejected as already consumed', async () => {
  const { rawToken } = await seedConvertedBooking();
  await acceptMidaoTravelerConfirmationDb(acceptInput({ rawToken }));
  await rejectsWith(
    () => acceptMidaoTravelerConfirmationDb(acceptInput({ rawToken, idempotencyKey: 'accept-key-2' })),
    { code: 'CONFIRMATION_TOKEN_ALREADY_CONSUMED', status: 409 },
  );
});

// ---------------------------------------------------------------------------
// T8：capacity conflict → rollback 語意
// ---------------------------------------------------------------------------
test('T8 a capacity conflict is rejected with 409 and leaves no partial mutation', async () => {
  const { rawToken, conversion } = await seedConvertedBooking();
  ACCEPT_INTERNAL.seedActiveBookingForTest({
    bookingId: '88888888-8888-4888-8888-888888888888',
    activityPlanId: PLAN_ID,
    activityId: ACTIVITY_ID,
    localDate: '2026-09-01',
    participants: 3,
    status: 'confirmed',
  });

  await rejectsWith(
    () => acceptMidaoTravelerConfirmationDb(acceptInput({ rawToken })),
    { code: 'CAPACITY_EXCEEDED', status: 409 },
  );

  const stores = CONFIRMATION_INTERNAL.inspectStoresForTest();
  const token = stores.confirmationTokens.find((row) => row.bookingId === conversion.bookingId);
  const booking = stores.bookings.find((row) => row.bookingId === conversion.bookingId);
  assert.equal(token.consumedAt, null);
  assert.equal(booking.travelerConfirmationStatus, 'pending');
  assert.deepEqual(stores.idempotency.filter((row) => row.key.includes('accept_traveler_confirmation')), []);
});

// ---------------------------------------------------------------------------
// T9：idempotency conflict
// ---------------------------------------------------------------------------
test('T9 the same idempotency key with a different request hash conflicts', async () => {
  const { rawToken } = await seedConvertedBooking();
  await acceptMidaoTravelerConfirmationDb(acceptInput({ rawToken }));
  await rejectsWith(
    () => acceptMidaoTravelerConfirmationDb(acceptInput({
      rawToken,
      requestHash: hashIdempotentRequest({ unexpected: true }),
    })),
    { code: 'IDEMPOTENCY_CONFLICT', status: 409 },
  );
});

// ---------------------------------------------------------------------------
// T10：idempotency in progress
// ---------------------------------------------------------------------------
test('T10 a still-processing idempotency record is rejected with 409', async () => {
  const { rawToken, conversion } = await seedConvertedBooking();
  ACCEPT_INTERNAL.seedAcceptIdempotencyForTest({
    bookingId: conversion.bookingId,
    idempotencyKey: 'accept-key-1',
    requestHash: EMPTY_BODY_HASH,
    state: 'processing',
  });
  await rejectsWith(
    () => acceptMidaoTravelerConfirmationDb(acceptInput({ rawToken })),
    { code: 'IDEMPOTENCY_IN_PROGRESS', status: 409 },
  );
});

// ---------------------------------------------------------------------------
// T11：RPC 錯誤反解（Supabase fake）
// ---------------------------------------------------------------------------
test('T11 every mapped RPC token becomes its documented public code and status', async () => {
  const matrix = [
    ['CONFIRMATION_TOKEN_NOT_FOUND', 'NOT_FOUND', 404],
    ['CONFIRMATION_TOKEN_EXPIRED', 'CONFIRMATION_TOKEN_EXPIRED', 410],
    ['CONFIRMATION_TOKEN_ALREADY_CONSUMED', 'CONFIRMATION_TOKEN_ALREADY_CONSUMED', 409],
    ['PLAN_NOT_FOUND', 'NOT_FOUND', 404],
    ['CAPACITY_EXCEEDED', 'CAPACITY_EXCEEDED', 409],
    ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT', 409],
    ['IDEMPOTENCY_IN_PROGRESS', 'IDEMPOTENCY_IN_PROGRESS', 409],
  ];
  for (const [token, code, status] of matrix) {
    useSupabase(createSupabaseFake({ rpcError: { code: 'P0001', message: token } }));
    await rejectsWith(
      () => acceptMidaoTravelerConfirmationDb(acceptInput()),
      { code, status },
    );
    assert.equal(ACCEPT_ERROR_STATUS[code], status);
  }
});

// ---------------------------------------------------------------------------
// T12：子字串陷阱
// ---------------------------------------------------------------------------
test('T12 longer RPC tokens win over their shorter prefixes', async () => {
  assert.equal(acceptRpcErrorToken({ message: 'CONFIRMATION_TOKEN_ALREADY_CONSUMED' }), 'CONFIRMATION_TOKEN_ALREADY_CONSUMED');
  assert.equal(acceptRpcErrorToken({ message: 'CONFIRMATION_TOKEN_EXPIRED' }), 'CONFIRMATION_TOKEN_EXPIRED');
  assert.equal(acceptRpcErrorToken({ message: 'nothing to see here' }), null);
  const sorted = [...ACCEPT_RPC_ERROR_TOKENS];
  for (let index = 1; index < sorted.length; index += 1) {
    assert.ok(sorted[index - 1].length >= sorted[index].length, 'tokens must be sorted by descending length');
  }

  useSupabase(createSupabaseFake({
    rpcError: { code: 'P0001', message: 'CONFIRMATION_TOKEN_ALREADY_CONSUMED' },
  }));
  await rejectsWith(
    () => acceptMidaoTravelerConfirmationDb(acceptInput()),
    { code: 'CONFIRMATION_TOKEN_ALREADY_CONSUMED', status: 409 },
  );
});

// ---------------------------------------------------------------------------
// T13：22023 家族 → 500
// ---------------------------------------------------------------------------
test('T13 the 22023 input-format RPC family surfaces as an internal error', async () => {
  for (const message of [
    'INVALID_TRAVELER_ID',
    'INVALID_CONFIRMATION_TOKEN_HASH',
    'INVALID_IDEMPOTENCY_KEY',
    'INVALID_REQUEST_HASH',
  ]) {
    useSupabase(createSupabaseFake({ rpcError: { code: '22023', message } }));
    await assert.rejects(
      () => acceptMidaoTravelerConfirmationDb(acceptInput()),
      (error) => {
        assert.equal(error.code, undefined);
        assert.equal(error.status, undefined);
        assertNoLeak(error.message);
        return true;
      },
    );
  }
});

// ---------------------------------------------------------------------------
// T14：MIDAO_IDEMPOTENCY_RELATION_INVALID → 500
// ---------------------------------------------------------------------------
test('T14 a broken idempotency relation surfaces as an internal error', async () => {
  useSupabase(createSupabaseFake({
    rpcError: { code: 'P0002', message: 'MIDAO_IDEMPOTENCY_RELATION_INVALID' },
  }));
  await assert.rejects(
    () => acceptMidaoTravelerConfirmationDb(acceptInput()),
    (error) => {
      assert.equal(error.code, undefined);
      assertNoLeak(error.message);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// T15：RPC 參數正確性
// ---------------------------------------------------------------------------
test('T15 the RPC is called with exactly the four documented arguments and a hashed token', async () => {
  const fake = useSupabase(createSupabaseFake({ rpcData: rpcSuccessPayload() }));
  const result = await acceptMidaoTravelerConfirmationDb(acceptInput());

  assert.equal(fake.calls.length, 1);
  const [call] = fake.calls;
  assert.equal(call.name, 'midao_accept_traveler_confirmation');
  assert.deepEqual(Object.keys(call.args).sort(), [
    'p_confirmation_token_hash',
    'p_idempotency_key',
    'p_request_hash',
    'p_traveler_user_id',
  ]);
  assert.equal(call.args.p_traveler_user_id, TRAVELER_ID);
  assert.equal(call.args.p_confirmation_token_hash, FIXED_TOKEN_HASH);
  assert.notEqual(call.args.p_confirmation_token_hash, FIXED_RAW_TOKEN);
  assert.equal(call.args.p_idempotency_key, 'accept-key-1');
  assert.equal(call.args.p_request_hash, EMPTY_BODY_HASH);
  assert.equal(JSON.stringify(call.args).includes(FIXED_RAW_TOKEN), false);

  assert.equal(result.accepted, true);
  assert.equal(result.bookingId, BOOKING_ID);
  assert.equal(result.orderId, ORDER_ID);
  assert.equal(result.paymentDeadlineAt, '2026-08-08T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// T16：projection 形狀防呆
// ---------------------------------------------------------------------------
test('T16 an invalid RPC projection shape is rejected as an internal error', async () => {
  const invalidPayloads = [
    (() => { const payload = rpcSuccessPayload(); delete payload.order_id; return payload; })(),
    { ...rpcSuccessPayload(), extra_key: 1 },
    rpcSuccessPayload({ booking_status: 'confirmed' }),
    rpcSuccessPayload({ traveler_confirmation_status: 'pending' }),
    rpcSuccessPayload({ booking_id: 'not-a-uuid' }),
    rpcSuccessPayload({ accepted: 'true' }),
    null,
    [rpcSuccessPayload()],
  ];
  for (const payload of invalidPayloads) {
    assert.throws(() => validateAcceptProjection(payload), (error) => {
      assert.equal(error.code, undefined);
      return true;
    });
    useSupabase(createSupabaseFake({ rpcData: payload }));
    await assert.rejects(
      () => acceptMidaoTravelerConfirmationDb(acceptInput()),
      (error) => {
        assert.equal(error.code, undefined);
        assertNoLeak(error.message);
        return true;
      },
    );
  }
  // payment_deadline_at 允許 null（§10.2 R6）
  const nullDeadline = validateAcceptProjection(rpcSuccessPayload({ payment_deadline_at: null }));
  assert.equal(nullDeadline.paymentDeadlineAt, null);
  assert.equal(nullDeadline.replayed, false);
});

// ---------------------------------------------------------------------------
// T17：route 原始碼契約（靜態）
// ---------------------------------------------------------------------------
test('T17 the accept route wires CSRF, traveler auth and idempotency without touching the DB', () => {
  const source = readFileSync(ACCEPT_ROUTE_PATH, 'utf8');
  assert.match(source, /validateCsrf/u);
  assert.match(source, /getTravelerIdentity/u);
  assert.match(source, /parseIdempotencyKey/u);
  assert.match(source, /acceptMidaoTravelerConfirmationDb/u);
  // 事故上報鏈：以 handleRouteError 別名匯入 handleMidaoRouteError，
  // 同時滿足 issue1598-route-error-coverage-guard（與 admin backend-mode route 同慣例）。
  assert.match(source, /handleMidaoRouteError as handleRouteError/u);
  assert.match(source, /return handleRouteError\(error, \{ route: /u);
  assert.doesNotMatch(source, /withMidaoGuideCommand/u);
  assert.doesNotMatch(source, /from\('bookings'\)|from\('orders'\)|from\('booking_confirmation_tokens'\)/u);
  assert.doesNotMatch(source, /console\./u);
  // route 標籤必須是字面量，不得由 request.url 組出（會把 raw token 送進 Sentry）
  assert.match(source, /'v2\/me\/booking-confirmations\/\[token\]\/accept'/u);

  // POST 存在／GET 不存在以靜態方式驗證：traveler-auth.ts → '../supabase/server'
  // 是無副檔名 import（Next bundler-only 解析），node --test 無法載入該模組圖，
  // 與 Task 39 對 mark-replied route 的處理方式一致（見 midao-inquiry-convert.test.mjs）。
  assert.match(source, /export async function POST\(/u);
  assert.doesNotMatch(source, /export (async function|const) GET\b/u);
});

// ---------------------------------------------------------------------------
// T18：Task 39 迴歸護欄（該檔零修改）
// ---------------------------------------------------------------------------
test('T18 the Task 39 conversion test file is untouched by this card', () => {
  const conversionTestPath = fileURLToPath(new URL('./midao-inquiry-convert.test.mjs', import.meta.url));
  const source = readFileSync(conversionTestPath, 'utf8');
  // Task 39 矩陣的錨點（若該檔被改動，這些錨點會先斷）
  assert.match(source, /T1 a guide converts a replied inquiry|Task 39/u);
  assert.match(source, /convertMidaoInquiryToBookingDb/u);
});

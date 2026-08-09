/**
 * #1759 Package 4／Task 43a：traveler confirmation preview GET API 測試矩陣 P1–P11／G1–G6／S1–S3。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-08-issue1759-task43-traveler-confirm-page-plan.md
 * §2 D3（S0–S7 判定順序，逐項鏡射 RPC）／§3.3（精確 8 鍵投影）／
 * §4.2（route 邊界順序）／§4.3（gateway 分支）／§5.1（本矩陣）。
 *
 * 一律使用 in-memory 分支（__setSupabaseClientForTest(null)），禁止連真實 PostgreSQL。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { hashIdempotentRequest } from '../../src/lib/midao/idempotency.ts';
import {
  PREVIEW_STATUSES,
  buildConfirmationPreview,
  resolveConfirmationPreviewStatus,
} from '../../src/lib/midao/booking-confirmation-preview.ts';
import {
  __resetMidaoBookingConfirmationStoreForTest,
  __seedMidaoInquiryConversionFixtureForTest,
  __setMidaoBookingConfirmationClockForTest,
  __setMidaoConfirmationTokenFactoryForTest,
  convertMidaoInquiryToBookingDb,
} from '../../src/lib/midao/db-midao-booking-confirmations.mjs';
import {
  acceptMidaoTravelerConfirmationDb,
  getMidaoTravelerConfirmationPreviewDb,
} from '../../src/lib/midao/db-midao-traveler-confirmation.mjs';
import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';

const PREVIEW_ROUTE_PATH = fileURLToPath(new URL(
  '../../app/api/v2/me/booking-confirmations/[token]/route.ts',
  import.meta.url,
));
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
const FIXED_NOW = '2026-08-07T00:00:00.000Z';
const FIXED_RAW_TOKEN = 'f'.repeat(64);
const OTHER_RAW_TOKEN = 'a'.repeat(64);
const HEX64_PATTERN = /[0-9a-f]{64}/u;

const BOOKING_ID = '55555555-5555-4555-8555-555555555555';
const ORDER_ID = '66666666-6666-4666-8666-666666666666';

function resetAll() {
  __setSupabaseClientForTest(null);
  __resetMidaoBookingConfirmationStoreForTest();
  __setMidaoBookingConfirmationClockForTest(FIXED_NOW);
  __setMidaoConfirmationTokenFactoryForTest(() => FIXED_RAW_TOKEN);
}

/** S2–S7 的健康輸入（全部合法 → pending）。 */
function statusInput(overrides = {}) {
  return {
    bookingStatus: 'draft',
    travelerConfirmationStatus: 'pending',
    travelerConfirmationExpiresAt: '2026-08-07T12:00:00.000Z',
    tokenConsumedAt: null,
    tokenExpiresAt: '2026-08-07T12:00:00.000Z',
    now: FIXED_NOW,
    ...overrides,
  };
}

/** §3.3 投影的健康輸入。 */
function previewInput(overrides = {}) {
  return {
    status: 'pending',
    bookingId: BOOKING_ID,
    orderId: ORDER_ID,
    activityId: ACTIVITY_ID,
    activityPlanId: PLAN_ID,
    title: '山徑晨光小旅行',
    planName: '日間小團',
    startAt: '2026-09-01T02:00:00.000Z',
    endAt: '2026-09-01T06:00:00.000Z',
    partySize: 2,
    quotedTotalTwd: 3600,
    currency: 'TWD',
    expiresAt: '2026-08-07T12:00:00.000Z',
    ...overrides,
  };
}

function seedConversionFixture({ plan = {}, traveler = {} } = {}) {
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
      maxParticipants: 8,
      ...plan,
    },
    traveler: { id: TRAVELER_ID, name: '旅客', email: 'traveler@example.com', ...traveler },
  });
}

async function convertOnce(overrides = {}) {
  return convertMidaoInquiryToBookingDb({
    guideId: GUIDE_ID,
    actorType: 'guide',
    actorId: GUIDE_ID,
    inquiryId: INQUIRY_ID,
    activityPlanId: PLAN_ID,
    startAt: '2026-09-01T02:00:00.000Z',
    endAt: '2026-09-01T06:00:00.000Z',
    participants: 2,
    quotedTotalTwd: 8000,
    guideNote: null,
    confirmationTtlHours: 12,
    idempotencyKey: 'convert-key-0001',
    requestHash: hashIdempotentRequest({ seed: 'convert' }),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// P1–P11：純函式層（§2 D3 判定順序 + §3.3 投影形狀）
// ---------------------------------------------------------------------------

test('P1 純函式 S7：全部合法 → pending', () => {
  assert.equal(resolveConfirmationPreviewStatus(statusInput()), 'pending');
  assert.deepEqual([...PREVIEW_STATUSES], ['pending', 'expired', 'used']);
});

test('P2 純函式 S2：booking.status=confirmed → expired', () => {
  assert.equal(resolveConfirmationPreviewStatus(statusInput({ bookingStatus: 'confirmed' })), 'expired');
});

test('P3 純函式 S3：traveler_confirmation_status=confirmed → used', () => {
  assert.equal(
    resolveConfirmationPreviewStatus(statusInput({ travelerConfirmationStatus: 'confirmed' })),
    'used',
  );
});

test('P4 純函式 S3：expired / not_required → expired', () => {
  assert.equal(
    resolveConfirmationPreviewStatus(statusInput({ travelerConfirmationStatus: 'expired' })),
    'expired',
  );
  assert.equal(
    resolveConfirmationPreviewStatus(statusInput({ travelerConfirmationStatus: 'not_required' })),
    'expired',
  );
});

test('P5 純函式 S4：traveler_confirmation_expires_at=null → expired', () => {
  assert.equal(
    resolveConfirmationPreviewStatus(statusInput({ travelerConfirmationExpiresAt: null })),
    'expired',
  );
});

test('P6 純函式 S4：expiresAt 等於 now（邊界 <=）→ expired', () => {
  assert.equal(
    resolveConfirmationPreviewStatus(statusInput({ travelerConfirmationExpiresAt: FIXED_NOW })),
    'expired',
  );
});

test('P7 純函式 S5：token.consumed_at 非 null → used', () => {
  assert.equal(
    resolveConfirmationPreviewStatus(statusInput({ tokenConsumedAt: '2026-08-06T00:00:00.000Z' })),
    'used',
  );
});

test('P8 純函式 S6：token.expires_at <= now → expired', () => {
  assert.equal(resolveConfirmationPreviewStatus(statusInput({ tokenExpiresAt: FIXED_NOW })), 'expired');
  assert.equal(
    resolveConfirmationPreviewStatus(statusInput({ tokenExpiresAt: '2026-08-06T00:00:00.000Z' })),
    'expired',
  );
});

test('P9 純函式 順序：S2 命中 expired 必須勝過 S5 命中 used（鏡射 RPC 順序）', () => {
  // booking.status 非 draft（S2 → expired）且 token 已被消費（S5 → used）。
  // RPC 於層 5 先擋 status，故 preview 必須回 expired；若回 used 即代表順序自創。
  assert.equal(
    resolveConfirmationPreviewStatus(statusInput({
      bookingStatus: 'confirmed',
      tokenConsumedAt: '2026-08-06T00:00:00.000Z',
    })),
    'expired',
  );
  // S3(used) 必須勝過 S4(expired)：travelerConfirmationStatus=confirmed 且期限已過。
  assert.equal(
    resolveConfirmationPreviewStatus(statusInput({
      travelerConfirmationStatus: 'confirmed',
      travelerConfirmationExpiresAt: null,
    })),
    'used',
  );
  // S4(expired) 必須勝過 S5(used)：期限已過且 token 已消費。
  assert.equal(
    resolveConfirmationPreviewStatus(statusInput({
      travelerConfirmationExpiresAt: FIXED_NOW,
      tokenConsumedAt: '2026-08-06T00:00:00.000Z',
    })),
    'expired',
  );
});

test('P10 純函式 投影恰 8 頂層鍵，巢狀鍵集合精確', () => {
  const preview = buildConfirmationPreview(previewInput());
  assert.deepEqual(Object.keys(preview).sort(), [
    'bookingId', 'expiresAt', 'orderId', 'partySize', 'price', 'schedule', 'service', 'status',
  ]);
  assert.deepEqual(Object.keys(preview.service).sort(), [
    'activityId', 'activityPlanId', 'planName', 'title',
  ]);
  assert.deepEqual(Object.keys(preview.schedule).sort(), ['endAt', 'startAt']);
  assert.deepEqual(Object.keys(preview.price).sort(), ['currency', 'quotedTotalTwd']);
  assert.equal(preview.price.currency, 'TWD');
  assert.equal(preview.partySize, 2);
  // 時間戳一律正規化為 ISO。
  const shifted = buildConfirmationPreview(previewInput({ startAt: '2026-09-01T10:00:00+08:00' }));
  assert.equal(shifted.schedule.startAt, '2026-09-01T02:00:00.000Z');
  // title / planName 可為 null，不得丟錯。
  const nulled = buildConfirmationPreview(previewInput({ title: null, planName: null, expiresAt: null }));
  assert.equal(nulled.service.title, null);
  assert.equal(nulled.service.planName, null);
  assert.equal(nulled.expiresAt, null);
});

test('P11 純函式 投影零 token 零 PII', () => {
  const preview = buildConfirmationPreview(previewInput());
  const serialized = JSON.stringify(preview);
  for (const forbidden of [
    'token', 'tokenHash', 'travelerId', 'guideId', 'sourceInquiryId',
    'paymentDeadlineAt', 'consumedAt', 'planBasePriceTwd',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `投影不得含 ${forbidden}`);
  }
  assert.equal(HEX64_PATTERN.test(serialized), false, '投影不得含任何 64 hex 值');
  assert.equal(/@/u.test(serialized), false, '投影不得含 email');
});

// ---------------------------------------------------------------------------
// G1–G6：gateway（in-memory 分支）
// ---------------------------------------------------------------------------

test('G1 gateway in-memory：conversion → preview 回 pending 且欄位對得上 seeded 值', async () => {
  resetAll();
  seedConversionFixture({ plan: { name: '日間小團', activityTitle: '山徑晨光小旅行' } });
  const converted = await convertOnce();

  const preview = await getMidaoTravelerConfirmationPreviewDb({
    travelerUserId: TRAVELER_ID,
    rawToken: FIXED_RAW_TOKEN,
  });

  assert.equal(preview.status, 'pending');
  assert.equal(preview.bookingId, converted.bookingId);
  assert.equal(preview.orderId, converted.orderId);
  assert.deepEqual(preview.service, {
    activityId: ACTIVITY_ID,
    activityPlanId: PLAN_ID,
    title: '山徑晨光小旅行',
    planName: '日間小團',
  });
  assert.deepEqual(preview.schedule, {
    startAt: '2026-09-01T02:00:00.000Z',
    endAt: '2026-09-01T06:00:00.000Z',
  });
  assert.equal(preview.partySize, 2);
  assert.deepEqual(preview.price, { quotedTotalTwd: 8000, currency: 'TWD' });
  assert.equal(preview.expiresAt, converted.travelerConfirmationExpiresAt);
});

test('G2 gateway in-memory：非本人 travelerUserId → 404 NOT_FOUND', async () => {
  resetAll();
  seedConversionFixture();
  await convertOnce();

  await assert.rejects(
    () => getMidaoTravelerConfirmationPreviewDb({
      travelerUserId: OTHER_TRAVELER_ID,
      rawToken: FIXED_RAW_TOKEN,
    }),
    (error) => {
      assert.equal(error.code, 'NOT_FOUND');
      assert.equal(error.status, 404);
      assert.equal(error.message, 'Resource not found');
      return true;
    },
  );
});

test('G3 gateway in-memory：不存在的 token → 與 G2 同碼同訊息同狀態', async () => {
  resetAll();
  seedConversionFixture();
  await convertOnce();

  await assert.rejects(
    () => getMidaoTravelerConfirmationPreviewDb({
      travelerUserId: TRAVELER_ID,
      rawToken: OTHER_RAW_TOKEN,
    }),
    (error) => {
      assert.equal(error.code, 'NOT_FOUND');
      assert.equal(error.status, 404);
      assert.equal(error.message, 'Resource not found');
      return true;
    },
  );
});

test('G4 gateway in-memory：先 accept 成功再 preview → used', async () => {
  resetAll();
  seedConversionFixture();
  await convertOnce();

  await acceptMidaoTravelerConfirmationDb({
    travelerUserId: TRAVELER_ID,
    rawToken: FIXED_RAW_TOKEN,
    idempotencyKey: 'accept-key-0001',
    requestHash: hashIdempotentRequest({}),
  });

  const preview = await getMidaoTravelerConfirmationPreviewDb({
    travelerUserId: TRAVELER_ID,
    rawToken: FIXED_RAW_TOKEN,
  });
  assert.equal(preview.status, 'used');
});

test('G5 gateway in-memory：plan.name／activityTitle 未 seed → title/planName 為 null', async () => {
  resetAll();
  seedConversionFixture();
  await convertOnce();

  const preview = await getMidaoTravelerConfirmationPreviewDb({
    travelerUserId: TRAVELER_ID,
    rawToken: FIXED_RAW_TOKEN,
  });
  assert.equal(preview.service.title, null);
  assert.equal(preview.service.planName, null);
  assert.equal(preview.status, 'pending');
});

test('G6 gateway in-memory：order 關聯不存在 → backend error（非 4xx）', async () => {
  resetAll();
  seedConversionFixture();
  const converted = await convertOnce();

  const { __confirmationRuntime } = await import('../../src/lib/midao/db-midao-booking-confirmations.mjs');
  __confirmationRuntime.orderStore.delete(converted.orderId);

  await assert.rejects(
    () => getMidaoTravelerConfirmationPreviewDb({
      travelerUserId: TRAVELER_ID,
      rawToken: FIXED_RAW_TOKEN,
    }),
    (error) => {
      assert.equal(error.name, 'MidaoTravelerConfirmationBackendError');
      assert.equal(error.status, undefined);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// S1–S3：route source contract（§4.2 邊界順序）
// ---------------------------------------------------------------------------

test('S1 route 原始碼：含讀取閘/正規化/身分，且不含 CSRF 與 Idempotency-Key', () => {
  const source = readFileSync(PREVIEW_ROUTE_PATH, 'utf8');
  assert.match(source, /export async function GET\(/u);
  assert.match(source, /isMidaoBackendEnabled/u);
  assert.match(source, /normalizeConfirmationRawToken/u);
  assert.match(source, /getTravelerIdentity/u);
  assert.match(source, /getMidaoTravelerConfirmationPreviewDb/u);
  assert.equal(source.includes('validateCsrf'), false, 'GET 唯讀不得掛 CSRF');
  assert.equal(source.includes('parseIdempotencyKey'), false, 'GET 不得接受 Idempotency-Key');
  assert.equal(source.includes('isMidaoBackendMutationsEnabled'), false, 'GET 應掛讀取閘而非寫入閘');
  assert.equal(source.includes('export async function POST'), false, '本檔僅提供 GET');

  // 邊界順序：token 正規化必須早於身分解析（否則 401/404 差異即成 oracle）。
  assert.ok(
    source.indexOf('normalizeConfirmationRawToken') < source.indexOf('getTravelerIdentity()'),
    'token 正規化必須先於 getTravelerIdentity()',
  );
  // 讀取閘必須早於 token 正規化。
  assert.ok(
    source.indexOf('isMidaoBackendEnabled(') < source.indexOf('normalizeConfirmationRawToken('),
    '讀取閘必須先於 token 正規化',
  );
});

test('S2 route 原始碼：route 標籤為字面量且不由 request.url 組出', () => {
  const source = readFileSync(PREVIEW_ROUTE_PATH, 'utf8');
  assert.ok(
    source.includes("route: 'v2/me/booking-confirmations/[token]'"),
    'route 標籤必須為字面量',
  );
  assert.equal(source.includes('request.url'), false, 'route 標籤不得由 request.url 組出（會把 raw token 送進 Sentry）');
});

test('S3 route 原始碼：no-store + force-dynamic；accept route 既有關鍵行未被修改', () => {
  const source = readFileSync(PREVIEW_ROUTE_PATH, 'utf8');
  assert.match(source, /export const dynamic = 'force-dynamic'/u);
  assert.match(source, /'cache-control': 'no-store'/u);

  const acceptSource = readFileSync(ACCEPT_ROUTE_PATH, 'utf8');
  for (const line of [
    'export async function POST(',
    'const csrfError = validateCsrf(request);',
    'if (!isMidaoBackendMutationsEnabled()) {',
    "const rawToken = normalizeConfirmationRawToken((await context.params).token);",
    "const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'));",
    "route: 'v2/me/booking-confirmations/[token]/accept'",
  ]) {
    assert.ok(acceptSource.includes(line), `accept route 既有關鍵行不得被修改：${line}`);
  }
});

/** Private in-memory confirmation owner. Gateways use domain operations only. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { routeError, notFound, unexpected, assertConversionAllowed, normalizeUuid } from './confirmation-conversion-policy.mjs';
import { HASH_PATTERN, normalizeTimestamp } from './confirmation-values.mjs';
import { acceptRouteError } from './booking-confirmation.ts';
import { acceptUnexpected, acceptNotFound } from './confirmation-runtime-errors.mjs';
import { buildConfirmationPreview, resolveConfirmationPreviewStatus } from './booking-confirmation-preview.ts';

const inquiryFixtureStore = new Map();
const planFixtureStore = new Map();
const travelerFixtureStore = new Map();
const bookingStore = new Map();
const orderStore = new Map();
const confirmationTokenStore = new Map();
const idempotencyStore = new Map();

let nowProvider = () => new Date().toISOString();
let tokenFactory = () => randomBytes(32).toString('hex');

function requireTimestamp(value) {
  const normalized = normalizeTimestamp(value);
  if (!normalized) throw unexpected('Midao inquiry conversion returned an invalid timestamp');
  return normalized;
}

function nowIso() {
  return requireTimestamp(nowProvider());
}

function issueConfirmationToken() {
  const raw = tokenFactory();
  if (typeof raw !== 'string' || !HASH_PATTERN.test(raw)) {
    throw unexpected('Midao confirmation token factory produced an invalid token');
  }
  return { raw, tokenHash: createHash('sha256').update(raw).digest('hex') };
}

export function __setMidaoBookingConfirmationClockForTest(clock) {
  if (typeof clock === 'function') {
    nowProvider = clock;
    return;
  }
  if (typeof clock === 'string') {
    nowProvider = () => clock;
    return;
  }
  nowProvider = () => new Date().toISOString();
}

export function __setMidaoConfirmationTokenFactoryForTest(factory) {
  tokenFactory = typeof factory === 'function' ? factory : () => randomBytes(32).toString('hex');
}

function clone(value) { return structuredClone(value); }

export function __resetMidaoBookingConfirmationStoreForTest() {
  inquiryFixtureStore.clear();
  planFixtureStore.clear();
  travelerFixtureStore.clear();
  bookingStore.clear();
  orderStore.clear();
  confirmationTokenStore.clear();
  idempotencyStore.clear();
}

export function seedConversionFixture(fixture = {}) {
  fixture = clone(fixture);
  const inquiry = fixture.inquiry ?? null;
  const plan = fixture.plan ?? null;
  const traveler = fixture.traveler ?? null;
  if (inquiry) {
    inquiryFixtureStore.set(normalizeUuid(inquiry.id, 'INVALID_INQUIRY_ID'), {
      id: normalizeUuid(inquiry.id, 'INVALID_INQUIRY_ID'),
      guideId: String(inquiry.guideId),
      activityId: String(inquiry.activityId),
      status: String(inquiry.status),
      convertedBookingId: inquiry.convertedBookingId ?? null,
      travelerUserId: inquiry.travelerUserId ?? null,
    });
  }
  if (plan) {
    planFixtureStore.set(normalizeUuid(plan.id, 'INVALID_PLAN_ID'), {
      id: normalizeUuid(plan.id, 'INVALID_PLAN_ID'),
      activityId: String(plan.activityId),
      guideId: String(plan.guideId),
      bookingType: String(plan.bookingType),
      status: String(plan.status),
      minParticipants: plan.minParticipants,
      maxParticipants: plan.maxParticipants,
      // Task 43a additive：preview 需顯示方案名／服務名（Supabase 分支分別來自
      // activity_plans.name 與 activities.title）。既有呼叫端未傳時一律 null，
      // 行為位元級不變（計畫 §2 D4 in-memory parity）。
      name: plan.name ?? null,
      activityTitle: plan.activityTitle ?? null,
    });
  }
  if (traveler) {
    travelerFixtureStore.set(String(traveler.id), {
      id: String(traveler.id),
      name: traveler.name ?? null,
      email: traveler.email ?? null,
    });
  }
  return clone({ inquiry, plan, traveler });
}

export function inspectStoresForTest() {
  return {
    bookings: [...bookingStore.values()].map((row) => clone(row)),
    orders: [...orderStore.values()].map((row) => clone(row)),
    confirmationTokens: [...confirmationTokenStore.values()].map((row) => clone(row)),
    idempotency: [...idempotencyStore.entries()].map(([key, record]) => ({ key, ...clone(record) })),
  };
}

const ACTIVE_BOOKING_STATUSES = new Set([
  'draft',
  'external_hold',
  'pending_confirmation',
  'confirmed',
  'reschedule_requested',
]);

export function taipeiLocalDate(isoTimestamp) {
  return new Date(Date.parse(isoTimestamp)).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function commandKey(command) {
  return `inquiry:${command.inquiryId}:convert_inquiry_to_booking:${command.idempotencyKey}`;
}

export function convertInMemory(command) {
  const key = commandKey(command);
  const existing = idempotencyStore.get(key);
  if (existing) {
    if (existing.requestHash !== command.requestHash) throw routeError('IDEMPOTENCY_CONFLICT');
    if (existing.state === 'processing') throw routeError('IDEMPOTENCY_IN_PROGRESS');
    if (existing.state !== 'completed' || !existing.responseBody) {
      throw unexpected('Midao inquiry conversion idempotency record is invalid');
    }
    return { sanitized: clone(existing.responseBody), created: false, rawToken: null };
  }

  const inquiry = inquiryFixtureStore.get(command.inquiryId);
  if (!inquiry) throw notFound();
  const plan = planFixtureStore.get(command.activityPlanId) ?? null;
  if (!plan) throw notFound();

  assertConversionAllowed({
    inquiry,
    plan,
    command,
    actorGuideId: command.guideId,
  });

  const localDate = taipeiLocalDate(command.startAt);
  let bookedParticipants = 0;
  for (const booking of bookingStore.values()) {
    if (booking.activityPlanId !== plan.id) continue;
    if (booking.localDate !== localDate) continue;
    if (!ACTIVE_BOOKING_STATUSES.has(booking.status)) continue;
    bookedParticipants += booking.participants;
  }
  if (bookedParticipants + command.participants > plan.maxParticipants) {
    throw routeError('CAPACITY_EXCEEDED');
  }

  const { raw, tokenHash } = issueConfirmationToken();
  const createdAt = nowIso();
  const expiresAt = new Date(
    Date.parse(createdAt) + (command.confirmationTtlHours * 60 * 60 * 1000),
  ).toISOString();
  const bookingId = randomUUID();
  const orderId = randomUUID();

  orderStore.set(orderId, {
    orderId,
    bookingId,
    activityId: inquiry.activityId,
    userId: inquiry.travelerUserId,
    participants: command.participants,
    totalTwd: command.quotedTotalTwd,
    status: 'pending_payment',
    paymentStatus: 'pending',
    // Task 40：accept 需回傳付款期限；對齊 migration 的 v_now + INTERVAL '24 hours'。
    paymentDeadlineAt: new Date(Date.parse(createdAt) + (24 * 60 * 60 * 1000)).toISOString(),
    createdAt,
  });
  bookingStore.set(bookingId, {
    bookingId,
    bookingNo: null,
    orderId,
    guideId: command.guideId,
    activityId: inquiry.activityId,
    activityPlanId: plan.id,
    sourceInquiryId: inquiry.id,
    // Task 40：accept 需驗歸屬（bookings.traveler_id ⇄ getTravelerIdentity().id 同 id space）。
    travelerId: inquiry.travelerUserId,
    participants: command.participants,
    localDate,
    startAt: command.startAt,
    endAt: command.endAt,
    status: 'draft',
    guideApprovalStatus: 'approved',
    guideApprovalNote: typeof command.guideNote === 'string' && command.guideNote.trim()
      ? command.guideNote.trim()
      : null,
    travelerConfirmationStatus: 'pending',
    travelerConfirmationExpiresAt: expiresAt,
    createdAt,
  });
  // 只存 sha256；raw token 絕不進入任何 store。
  confirmationTokenStore.set(bookingId, {
    bookingId,
    tokenHash,
    expiresAt,
    consumedAt: null,
    createdAt,
  });

  inquiry.convertedBookingId = bookingId;
  inquiry.status = 'converted';

  const sanitized = {
    inquiryId: inquiry.id,
    bookingId,
    orderId,
    bookingNo: null,
    bookingStatus: 'draft',
    travelerConfirmationStatus: 'pending',
    travelerConfirmationExpiresAt: expiresAt,
  };
  idempotencyStore.set(key, {
    state: 'completed',
    requestHash: command.requestHash,
    responseBody: clone(sanitized),
  });

  return { sanitized, created: true, rawToken: raw };
}

export function acceptCommandKey(bookingId, idempotencyKey) {
  return `booking:${bookingId}:accept_traveler_confirmation:${idempotencyKey}`;
}

export function acceptInMemory(command) {
  // 1. token_hash → bookingId（未鎖定解析，不可信任，稍後重讀）
  let tokenRow = null;
  for (const row of confirmationTokenStore.values()) {
    if (row.tokenHash === command.tokenHash) {
      tokenRow = row;
      break;
    }
  }
  if (!tokenRow) throw acceptNotFound();
  const bookingId = tokenRow.bookingId;

  // 2. idempotency claim：in-memory 為單執行緒，且 RPC 失敗會整筆 rollback，
  //    故此處先讀既有紀錄，僅在成功時寫入 completed（等價於 claim + rollback）。
  const key = acceptCommandKey(bookingId, command.idempotencyKey);
  const existing = idempotencyStore.get(key);

  // 4. orders → 5. bookings（鎖序與 RPC 相同，不得反向）
  const booking = bookingStore.get(bookingId) ?? null;
  if (!booking) throw acceptNotFound();
  let order = null;
  for (const row of orderStore.values()) {
    if (row.bookingId === bookingId) {
      order = row;
      break;
    }
  }
  if (!order) throw acceptUnexpected('Midao traveler confirmation order relation is invalid');

  // 6. replay 分支（必須早於 ownership）
  if (existing) {
    if (existing.requestHash !== command.requestHash) throw acceptRouteError('IDEMPOTENCY_CONFLICT');
    if (existing.state === 'processing') throw acceptRouteError('IDEMPOTENCY_IN_PROGRESS');
    if (existing.state !== 'completed' || !existing.responseBody) {
      throw acceptUnexpected('Midao traveler confirmation idempotency record is invalid');
    }
    return { sanitized: clone(existing.responseBody), replayed: true };
  }

  // 7. ownership：他人 token 與不存在 token 塌成同一個 404
  if (booking.travelerId !== command.travelerUserId) throw acceptNotFound();
  // 8./9./10. booking 狀態重驗
  if (booking.status !== 'draft') throw acceptRouteError('CONFIRMATION_TOKEN_EXPIRED');
  if (booking.travelerConfirmationStatus !== 'pending') {
    throw acceptRouteError('CONFIRMATION_TOKEN_ALREADY_CONSUMED');
  }
  const now = nowIso();
  if (!booking.travelerConfirmationExpiresAt
    || Date.parse(booking.travelerConfirmationExpiresAt) <= Date.parse(now)) {
    throw acceptRouteError('CONFIRMATION_TOKEN_EXPIRED');
  }
  // 11. token 重讀驗證
  if (tokenRow.consumedAt !== null) throw acceptRouteError('CONFIRMATION_TOKEN_ALREADY_CONSUMED');
  if (Date.parse(tokenRow.expiresAt) <= Date.parse(now)) {
    throw acceptRouteError('CONFIRMATION_TOKEN_EXPIRED');
  }

  // 12. capacity revalidation（排除自身）
  const plan = planFixtureStore.get(booking.activityPlanId) ?? null;
  if (!plan) throw acceptNotFound();
  let others = 0;
  for (const row of bookingStore.values()) {
    if (row.bookingId === bookingId) continue;
    if (row.activityId !== booking.activityId) continue;
    if (row.activityPlanId !== booking.activityPlanId) continue;
    if (row.localDate !== booking.localDate) continue;
    if (!ACTIVE_BOOKING_STATUSES.has(row.status)) continue;
    others += row.participants;
  }
  if (others + booking.participants > plan.maxParticipants) {
    throw acceptRouteError('CAPACITY_EXCEEDED');
  }

  // 13. CAS 消費 token → 更新 booking → 完成 idempotency
  //     （不動 bookings.status、不動 orders.payment_deadline_at、不呼叫 fn_book_schedule）
  tokenRow.consumedAt = now;
  booking.travelerConfirmationStatus = 'confirmed';
  booking.updatedAt = now;

  const sanitized = {
    accepted: true,
    bookingId,
    orderId: order.orderId,
    bookingStatus: booking.status,
    travelerConfirmationStatus: 'confirmed',
    paymentDeadlineAt: normalizeTimestamp(order.paymentDeadlineAt),
  };
  idempotencyStore.set(key, {
    state: 'completed',
    requestHash: command.requestHash,
    responseBody: clone(sanitized),
  });

  return { sanitized, replayed: false };
}

export function previewInMemory(command) {
  // 1. 線性掃 confirmationTokenStore 比對 tokenHash（owner 私有 representation）。
  let tokenRow = null;
  for (const row of confirmationTokenStore.values()) {
    if (row.tokenHash === command.tokenHash) {
      tokenRow = row;
      break;
    }
  }
  if (!tokenRow) throw acceptNotFound(); // S0

  // 2. booking
  const booking = bookingStore.get(tokenRow.bookingId) ?? null;
  if (!booking) throw acceptNotFound(); // S0

  // 3. ownership：他人 token 與不存在 token 同碼同訊息同狀態。
  if (booking.travelerId !== command.travelerUserId) throw acceptNotFound(); // S1

  // 4. order 關聯損毀 → 500（與 accept 對 orders 關聯的處理一致）。
  let order = null;
  for (const row of orderStore.values()) {
    if (row.bookingId === booking.bookingId) {
      order = row;
      break;
    }
  }
  if (!order) throw acceptUnexpected('Midao traveler confirmation order relation is invalid');

  // 5. 純顯示欄位：查無一律 null，不得 500。
  const plan = planFixtureStore.get(booking.activityPlanId) ?? null;

  // 6./7. 狀態判定 + 投影。
  const status = resolveConfirmationPreviewStatus({
    bookingStatus: booking.status,
    travelerConfirmationStatus: booking.travelerConfirmationStatus,
    travelerConfirmationExpiresAt: booking.travelerConfirmationExpiresAt,
    tokenConsumedAt: tokenRow.consumedAt,
    tokenExpiresAt: tokenRow.expiresAt,
    now: nowIso(),
  });

  return buildConfirmationPreview({
    status,
    bookingId: booking.bookingId,
    orderId: order.orderId,
    activityId: booking.activityId,
    activityPlanId: booking.activityPlanId,
    title: plan?.activityTitle ?? null,
    planName: plan?.name ?? null,
    startAt: booking.startAt,
    endAt: booking.endAt,
    partySize: booking.participants,
    // in-memory 的定價真值＝conversion 當下的 quotedTotalTwd（計畫 §2 D4）。
    // 不得在 in-memory 另建 pricing snapshot store（那是 Supabase 專屬形狀）。
    quotedTotalTwd: order.totalTwd,
    currency: 'TWD',
    expiresAt: booking.travelerConfirmationExpiresAt,
  });
}

/** 測試接縫：塞入同 plan／同 local date 的其他 active booking（容量衝突用）。 */
export function seedActiveBookingForTest(row = {}) {
  row = clone(row);
  const bookingId = String(row.bookingId);
  bookingStore.set(bookingId, {
    bookingId,
    bookingNo: null,
    orderId: null,
    guideId: row.guideId ?? null,
    activityId: String(row.activityId),
    activityPlanId: String(row.activityPlanId),
    sourceInquiryId: null,
    travelerId: row.travelerId ?? null,
    participants: Number(row.participants),
    localDate: String(row.localDate),
    startAt: row.startAt ?? null,
    endAt: row.endAt ?? null,
    status: String(row.status ?? 'confirmed'),
    guideApprovalStatus: 'approved',
    guideApprovalNote: null,
    travelerConfirmationStatus: 'confirmed',
    travelerConfirmationExpiresAt: null,
    createdAt: row.createdAt ?? nowIso(),
  });
  return clone(bookingStore.get(bookingId));
}

/** 測試接縫：預先塞 accept 的 idempotency 紀錄（processing／completed）。 */
export function seedAcceptIdempotencyForTest(row = {}) {
  const key = acceptCommandKey(String(row.bookingId), String(row.idempotencyKey));
  idempotencyStore.set(key, {
    state: String(row.state ?? 'processing'),
    requestHash: String(row.requestHash),
    responseBody: clone(row.responseBody ?? null),
  });
  return key;
}

export { nowIso, issueConfirmationToken };

/** Test-only lifecycle scenarios, including deliberately missing relations. No live handles. */
export function seedConfirmationLifecycleForTest(input = {}) {
  const scenario = clone(input);
  const { bookingId } = scenario;
  const booking = bookingStore.get(bookingId);
  const token = confirmationTokenStore.get(bookingId);
  if (!booking || !token) throw new Error('Confirmation fixture requires a converted booking');
  if ('bookingStatus' in scenario) booking.status = scenario.bookingStatus;
  if ('confirmationStatus' in scenario) booking.travelerConfirmationStatus = scenario.confirmationStatus;
  if ('bookingExpiresAt' in scenario) booking.travelerConfirmationExpiresAt = scenario.bookingExpiresAt;
  if ('tokenExpiresAt' in scenario) token.expiresAt = scenario.tokenExpiresAt;
  if ('consumedAt' in scenario) token.consumedAt = scenario.consumedAt;
  if (scenario.missingOrder) {
    for (const [id, order] of orderStore) if (order.bookingId === bookingId) orderStore.delete(id);
  }
  if (scenario.missingPlan) planFixtureStore.delete(booking.activityPlanId);
  if (scenario.missingBooking) bookingStore.delete(bookingId);
  if (scenario.missingToken) confirmationTokenStore.delete(bookingId);
}

/** Remove only competitor fixtures, preserving converted bookings. */
export function clearCapacityBookingsForTest() {
  for (const [id, booking] of bookingStore) {
    if (booking.sourceInquiryId === null) bookingStore.delete(id);
  }
}

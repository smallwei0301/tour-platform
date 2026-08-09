/**
 * #1759 Package 4／Task 39：inquiry → booking 轉換 gateway（薄層）。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-07-issue1759-task39-conversion-gateway-plan.md
 * §4.1 介面／§4.2 token／§4.3 confirmationUrl／§4.4 replay 誠實回應／
 * §4.5 錯誤碼統一對照表／§4.8 Supabase 查詢順序／§4.9 in-memory 分支。
 *
 * 安全不變式：
 * - raw confirmation token 只存在於單次請求記憶體與成功回應 body。
 *   DB／log／outbox／錯誤訊息／in-memory store 一律只有 sha256。
 * - 歸屬類錯誤（inquiry／plan 非本人）一律塌成 404 `Resource not found`，
 *   不得讓呼叫端用錯誤碼探測他人資料是否存在。
 * - 本檔不自行 INSERT/UPDATE bookings／orders／guide_inquiries；
 *   Supabase 路徑一切寫入由 midao_convert_inquiry_to_booking RPC 在單一交易完成。
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';
import { SITE_URL } from '../seo/site-metadata.ts';
import { validateInquiryConversion } from './inquiry-conversion.ts';
import { parseIdempotencyKey } from './idempotency.ts';
import { MidaoRouteError } from './route-errors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const ACTIVE_BOOKING_STATUSES = new Set([
  'draft',
  'external_hold',
  'pending_confirmation',
  'confirmed',
  'reschedule_requested',
]);

const RPC_NAME = 'midao_convert_inquiry_to_booking';
const RPC_PROJECTION_KEYS = [
  'booking_id',
  'booking_no',
  'booking_status',
  'confirmation_token_belongs_to_caller',
  'created',
  'inquiry_id',
  'order_id',
  'replayed',
  'traveler_confirmation_expires_at',
  'traveler_confirmation_status',
];

export const CONFIRMATION_TOKEN_NOTE_CREATED =
  '確認連結僅在本次回應顯示一次，請立即複製；重送相同 Idempotency-Key 不會再取得。';
export const CONFIRMATION_TOKEN_NOTE_REPLAYED =
  '此請求為重送（idempotent replay），確認連結僅在首次成功時回傳一次，無法再次取得。';

/** §4.5 B 類：RPC／in-memory 共用的公開錯誤碼 → 安全訊息。 */
const SAFE_MESSAGES = {
  NOT_FOUND: 'Resource not found',
  INQUIRY_ALREADY_CONVERTED: 'Inquiry was already converted',
  INQUIRY_STATE_NOT_CONVERTIBLE: 'Inquiry state does not allow conversion',
  PLAN_INACTIVE: 'Activity plan is not active',
  PLAN_BOOKING_TYPE_NOT_REQUEST: 'Activity plan does not accept inquiry conversion',
  PARTICIPANTS_BELOW_PLAN_MIN: 'Participants are below the plan minimum',
  PARTICIPANTS_ABOVE_PLAN_MAX: 'Participants exceed the plan maximum',
  CAPACITY_EXCEEDED: 'Requested date is fully booked',
  IDEMPOTENCY_CONFLICT: 'Idempotency key was already used for a different request',
  IDEMPOTENCY_IN_PROGRESS: 'A request with this Idempotency-Key is already processing',
  INVALID_INQUIRY_ID: 'Invalid inquiry id',
  INVALID_PLAN_ID: 'Invalid activity plan id',
};

const ERROR_STATUS = {
  NOT_FOUND: 404,
  INQUIRY_ALREADY_CONVERTED: 409,
  INQUIRY_STATE_NOT_CONVERTIBLE: 409,
  PLAN_INACTIVE: 409,
  PLAN_BOOKING_TYPE_NOT_REQUEST: 409,
  PARTICIPANTS_BELOW_PLAN_MIN: 409,
  PARTICIPANTS_ABOVE_PLAN_MAX: 409,
  CAPACITY_EXCEEDED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  INVALID_INQUIRY_ID: 422,
  INVALID_PLAN_ID: 422,
};

/**
 * §4.5 B 類：RPC message token → 公開錯誤碼。
 * 未列出的 token（22023 全家族、MIDAO_IDEMPOTENCY_RELATION_INVALID、無法反解）
 * 一律視為 gateway 傳參或關聯損毀，回 500 並上報。
 * 依 token 長度由長到短比對，避免短 token 誤命中長 token 的子字串。
 */
const RPC_ERROR_CODES = {
  TRAVELER_PROFILE_NOT_FOUND: 'NOT_FOUND',
  INQUIRY_NOT_FOUND: 'NOT_FOUND',
  PLAN_NOT_FOUND: 'NOT_FOUND',
  PLAN_GUIDE_MISMATCH: 'NOT_FOUND',
  PLAN_ACTIVITY_MISMATCH: 'NOT_FOUND',
  INQUIRY_ALREADY_CONVERTED: 'INQUIRY_ALREADY_CONVERTED',
  INQUIRY_STATE_NOT_CONVERTIBLE: 'INQUIRY_STATE_NOT_CONVERTIBLE',
  PLAN_INACTIVE: 'PLAN_INACTIVE',
  PLAN_BOOKING_TYPE_NOT_REQUEST: 'PLAN_BOOKING_TYPE_NOT_REQUEST',
  PARTICIPANTS_BELOW_PLAN_MIN: 'PARTICIPANTS_BELOW_PLAN_MIN',
  PARTICIPANTS_ABOVE_PLAN_MAX: 'PARTICIPANTS_ABOVE_PLAN_MAX',
  CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
};
const RPC_ERROR_TOKENS = Object.keys(RPC_ERROR_CODES).sort((left, right) => right.length - left.length);

/** §4.5 A 類：Task 37 violation code → 公開錯誤碼／HTTP status。 */
const VIOLATION_COLLAPSE_TO_NOT_FOUND = new Set([
  'INQUIRY_GUIDE_MISMATCH',
  'PLAN_GUIDE_MISMATCH',
  'PLAN_ACTIVITY_MISMATCH',
  'PLAN_NOT_FOUND_IN_INPUT',
]);
const VIOLATION_CONFLICT_CODES = new Set([
  'PLAN_BOOKING_TYPE_NOT_REQUEST',
  'PLAN_INACTIVE',
  'INQUIRY_STATE_NOT_CONVERTIBLE',
  'INQUIRY_ALREADY_CONVERTED',
]);

const inquiryFixtureStore = new Map();
const planFixtureStore = new Map();
const travelerFixtureStore = new Map();
const bookingStore = new Map();
const orderStore = new Map();
const confirmationTokenStore = new Map();
const idempotencyStore = new Map();

let nowProvider = () => new Date().toISOString();
let tokenFactory = () => randomBytes(32).toString('hex');

function routeError(code) {
  return new MidaoRouteError(code, SAFE_MESSAGES[code] ?? 'Request rejected', ERROR_STATUS[code] ?? 422);
}

function notFound() {
  return routeError('NOT_FOUND');
}

function unexpected(message = 'Midao inquiry conversion backend failure') {
  const error = new Error(message);
  error.name = 'MidaoInquiryConversionBackendError';
  return error;
}

function clone(value) {
  return structuredClone(value);
}

function normalizeUuid(value, code) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) throw routeError(code);
  return value.trim().toLowerCase();
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  try {
    return new Date(parsed).toISOString();
  } catch {
    return null;
  }
}

function requireTimestamp(value) {
  const normalized = normalizeTimestamp(value);
  if (!normalized) throw unexpected('Midao inquiry conversion returned an invalid timestamp');
  return normalized;
}

function nowIso() {
  return requireTimestamp(nowProvider());
}

/** 與 migration 層 3 相同的唯一 local_date 計算式（Asia/Taipei）。 */
function taipeiLocalDate(isoTimestamp) {
  return new Date(Date.parse(isoTimestamp)).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function normalizeCommand(input = {}) {
  const guideId = typeof input.guideId === 'string' ? input.guideId.trim() : '';
  const actorType = typeof input.actorType === 'string' ? input.actorType.trim().toLowerCase() : '';
  const actorId = typeof input.actorId === 'string' ? input.actorId.trim() : '';
  if (!guideId || !actorId || !['guide', 'admin'].includes(actorType)) {
    throw unexpected('Midao inquiry conversion actor context is incomplete');
  }

  const inquiryId = normalizeUuid(input.inquiryId, 'INVALID_INQUIRY_ID');
  const activityPlanId = normalizeUuid(input.activityPlanId, 'INVALID_PLAN_ID');

  let idempotencyKey;
  try {
    idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  } catch (error) {
    if (error?.code === 'INVALID_IDEMPOTENCY_KEY') throw error;
    throw new MidaoRouteError('INVALID_IDEMPOTENCY_KEY', 'Invalid Idempotency-Key', 422);
  }
  if (typeof input.requestHash !== 'string' || !HASH_PATTERN.test(input.requestHash)) {
    throw unexpected('Midao inquiry conversion request hash is invalid');
  }

  const guideNote = input.guideNote === undefined || input.guideNote === null
    ? null
    : input.guideNote;

  return {
    guideId,
    actorType,
    actorId,
    inquiryId,
    activityPlanId,
    // 以下四項刻意保持原值：型別／範圍一律交給 Task 37 純函式判定。
    startAt: input.startAt,
    endAt: input.endAt,
    participants: input.participants,
    quotedTotalTwd: input.quotedTotalTwd,
    guideNote,
    confirmationTtlHours: input.confirmationTtlHours,
    idempotencyKey,
    requestHash: input.requestHash,
  };
}

function commandProjection(command) {
  return {
    activityPlanId: command.activityPlanId,
    startAt: command.startAt,
    endAt: command.endAt,
    participants: command.participants,
    quotedTotalTwd: command.quotedTotalTwd,
    guideNote: typeof command.guideNote === 'string' ? command.guideNote : (command.guideNote ?? null),
    confirmationTtlHours: command.confirmationTtlHours,
  };
}

/** §4.5 A 類：把 Task 37 的第一個 violation 轉成公開錯誤。 */
function violationToRouteError(violation) {
  if (!violation) return unexpected('Midao inquiry conversion validation returned no violation');
  if (VIOLATION_COLLAPSE_TO_NOT_FOUND.has(violation.code)) return notFound();
  const status = VIOLATION_CONFLICT_CODES.has(violation.code) ? 409 : 422;
  return new MidaoRouteError(violation.code, violation.messageZh, status);
}

function assertConversionAllowed({ inquiry, plan, command, actorGuideId }) {
  const result = validateInquiryConversion({ inquiry, plan, command: commandProjection(command), actorGuideId });
  if (result.valid) return;
  throw violationToRouteError(result.violations[0]);
}

function buildConfirmationUrl(rawToken) {
  return `${SITE_URL}/booking/confirm/${rawToken}`;
}

function issueConfirmationToken() {
  const raw = tokenFactory();
  if (typeof raw !== 'string' || !HASH_PATTERN.test(raw)) {
    throw unexpected('Midao confirmation token factory produced an invalid token');
  }
  return { raw, tokenHash: createHash('sha256').update(raw).digest('hex') };
}

/** 成功／replay 的固定 key 集合（§4.1）。 */
function conversionResult(sanitized, { created, rawToken }) {
  return {
    created,
    replayed: !created,
    inquiryId: sanitized.inquiryId,
    bookingId: sanitized.bookingId,
    orderId: sanitized.orderId,
    bookingNo: sanitized.bookingNo,
    bookingStatus: sanitized.bookingStatus,
    travelerConfirmationStatus: sanitized.travelerConfirmationStatus,
    travelerConfirmationExpiresAt: sanitized.travelerConfirmationExpiresAt,
    confirmationToken: created ? rawToken : null,
    confirmationUrl: created ? buildConfirmationUrl(rawToken) : null,
    confirmationTokenNote: created ? CONFIRMATION_TOKEN_NOTE_CREATED : CONFIRMATION_TOKEN_NOTE_REPLAYED,
  };
}

function commandKey(command) {
  return `inquiry:${command.inquiryId}:convert_inquiry_to_booking:${command.idempotencyKey}`;
}

// ---------------------------------------------------------------------------
// 測試接縫
// ---------------------------------------------------------------------------

export function __resetMidaoBookingConfirmationStoreForTest() {
  inquiryFixtureStore.clear();
  planFixtureStore.clear();
  travelerFixtureStore.clear();
  bookingStore.clear();
  orderStore.clear();
  confirmationTokenStore.clear();
  idempotencyStore.clear();
}

export function __seedMidaoInquiryConversionFixtureForTest(fixture = {}) {
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
  return { inquiry, plan, traveler };
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

function inspectStoresForTest() {
  return {
    bookings: [...bookingStore.values()].map((row) => clone(row)),
    orders: [...orderStore.values()].map((row) => clone(row)),
    confirmationTokens: [...confirmationTokenStore.values()].map((row) => clone(row)),
    idempotency: [...idempotencyStore.entries()].map(([key, record]) => ({ key, ...clone(record) })),
  };
}

// ---------------------------------------------------------------------------
// in-memory 分支（§4.9）
// ---------------------------------------------------------------------------

function convertInMemory(command) {
  const key = commandKey(command);
  const existing = idempotencyStore.get(key);
  if (existing) {
    if (existing.requestHash !== command.requestHash) throw routeError('IDEMPOTENCY_CONFLICT');
    if (existing.state === 'processing') throw routeError('IDEMPOTENCY_IN_PROGRESS');
    if (existing.state !== 'completed' || !existing.responseBody) {
      throw unexpected('Midao inquiry conversion idempotency record is invalid');
    }
    return conversionResult(existing.responseBody, { created: false, rawToken: null });
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

  return conversionResult(sanitized, { created: true, rawToken: raw });
}

// ---------------------------------------------------------------------------
// Supabase 分支（§4.8）
// ---------------------------------------------------------------------------

function rpcErrorToken(error) {
  const values = [error?.code, error?.message, error?.details, error?.hint]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toUpperCase();
  return RPC_ERROR_TOKENS.find((token) => values.includes(token)) ?? null;
}

function mapRpcError(error) {
  const token = rpcErrorToken(error);
  if (token) throw routeError(RPC_ERROR_CODES[token]);
  // 22023 全家族／MIDAO_IDEMPOTENCY_RELATION_INVALID／無法反解 → 500 並上報。
  throw unexpected();
}

function validateRpcProjection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw unexpected('Midao inquiry conversion projection is not an object');
  }
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== RPC_PROJECTION_KEYS.join(',')) {
    throw unexpected('Midao inquiry conversion projection shape is invalid');
  }
  if (typeof value.created !== 'boolean' || typeof value.replayed !== 'boolean') {
    throw unexpected('Midao inquiry conversion projection flags are invalid');
  }
  if (value.booking_status !== 'draft' || value.traveler_confirmation_status !== 'pending') {
    throw unexpected('Midao inquiry conversion projection enum is invalid');
  }
  if (value.booking_no !== null && typeof value.booking_no !== 'string') {
    throw unexpected('Midao inquiry conversion booking number is invalid');
  }
  const projectionUuid = (raw) => {
    if (typeof raw !== 'string' || !UUID_PATTERN.test(raw.trim())) {
      throw unexpected('Midao inquiry conversion projection UUID is invalid');
    }
    return raw.trim().toLowerCase();
  };
  return {
    created: value.created,
    sanitized: {
      inquiryId: projectionUuid(value.inquiry_id),
      bookingId: projectionUuid(value.booking_id),
      orderId: projectionUuid(value.order_id),
      bookingNo: value.booking_no ?? null,
      bookingStatus: value.booking_status,
      travelerConfirmationStatus: value.traveler_confirmation_status,
      travelerConfirmationExpiresAt: requireTimestamp(value.traveler_confirmation_expires_at),
    },
  };
}

async function fetchConversionContext(supabase, command) {
  const inquiryQuery = await supabase
    .from('guide_inquiries')
    .select('id, guide_id, activity_id, status, converted_booking_id, traveler_user_id')
    .eq('id', command.inquiryId)
    .maybeSingle();
  if (inquiryQuery?.error) throw unexpected('Midao inquiry conversion inquiry lookup failed');
  const inquiryRow = inquiryQuery?.data ?? null;
  if (!inquiryRow) throw notFound();

  const planQuery = await supabase
    .from('activity_plans')
    .select('id, activity_id, booking_type, status, min_participants, max_participants')
    .eq('id', command.activityPlanId)
    .maybeSingle();
  if (planQuery?.error) throw unexpected('Midao inquiry conversion plan lookup failed');
  const planRow = planQuery?.data ?? null;
  if (!planRow) throw notFound();

  // plan.guideId 必須來自 activities.guide_id（activity_plans 無此欄位）。
  const activityQuery = await supabase
    .from('activities')
    .select('guide_id')
    .eq('id', planRow.activity_id)
    .maybeSingle();
  if (activityQuery?.error) throw unexpected('Midao inquiry conversion activity lookup failed');
  const activityRow = activityQuery?.data ?? null;
  if (!activityRow) throw notFound();

  let traveler = null;
  if (inquiryRow.traveler_user_id) {
    const travelerQuery = await supabase
      .from('users')
      .select('name, email')
      .eq('id', inquiryRow.traveler_user_id)
      .maybeSingle();
    if (travelerQuery?.error) throw unexpected('Midao inquiry conversion traveler lookup failed');
    traveler = travelerQuery?.data ?? null;
  }

  return {
    inquiry: {
      id: String(inquiryRow.id),
      guideId: String(inquiryRow.guide_id),
      activityId: String(inquiryRow.activity_id),
      status: String(inquiryRow.status),
      convertedBookingId: inquiryRow.converted_booking_id ?? null,
    },
    plan: {
      id: String(planRow.id),
      activityId: String(planRow.activity_id),
      guideId: String(activityRow.guide_id),
      bookingType: String(planRow.booking_type),
      status: String(planRow.status),
      minParticipants: planRow.min_participants,
      maxParticipants: planRow.max_participants,
    },
    contact: {
      name: typeof traveler?.name === 'string' && traveler.name.trim() ? traveler.name.trim() : null,
      email: typeof traveler?.email === 'string' && traveler.email.trim() ? traveler.email.trim() : null,
      // §4.8 U-5：public.users 無 phone 欄位，一律 null，不得臆造。
      phone: null,
    },
  };
}

function rpcArgs(command, contact, tokenHash) {
  return {
    p_guide_id: command.guideId,
    p_actor_type: command.actorType,
    p_actor_id: command.actorId,
    p_inquiry_id: command.inquiryId,
    p_activity_plan_id: command.activityPlanId,
    p_start_at: command.startAt,
    p_end_at: command.endAt,
    p_participants: command.participants,
    p_quoted_total_twd: command.quotedTotalTwd,
    p_guide_note: typeof command.guideNote === 'string' && command.guideNote.trim()
      ? command.guideNote.trim()
      : null,
    p_confirmation_ttl_hours: command.confirmationTtlHours,
    p_confirmation_token_hash: tokenHash,
    p_contact_name: contact.name,
    p_contact_phone: contact.phone,
    p_contact_email: contact.email,
    p_idempotency_key: command.idempotencyKey,
    p_request_hash: command.requestHash,
  };
}

async function convertInSupabase(command) {
  const supabase = await getSupabase();
  const context = await fetchConversionContext(supabase, command);

  // Task 37 純函式先擋，擋掉的請求絕不進 RPC。
  assertConversionAllowed({
    inquiry: { ...context.inquiry, convertedBookingId: context.inquiry.convertedBookingId },
    plan: context.plan,
    command,
    actorGuideId: command.guideId,
  });

  const { raw, tokenHash } = issueConfirmationToken();
  let response;
  try {
    response = await supabase.rpc(RPC_NAME, rpcArgs(command, context.contact, tokenHash));
  } catch (error) {
    if (error?.code && ERROR_STATUS[error.code]) throw error;
    throw unexpected();
  }
  if (response?.error) mapRpcError(response.error);

  const { created, sanitized } = validateRpcProjection(response?.data);
  return conversionResult(sanitized, { created, rawToken: raw });
}

/**
 * inquiry → booking 轉換指令入口（route 直接把回傳交給 jsonOk）。
 * @param {Record<string, unknown>} input
 */
export async function convertMidaoInquiryToBookingDb(input = {}) {
  const command = normalizeCommand(input);
  if (hasSupabaseEnv()) return convertInSupabase(command);
  return convertInMemory(command);
}

export const __internal = {
  normalizeCommand,
  mapRpcError,
  buildConfirmationUrl,
  validateRpcProjection,
  violationToRouteError,
  taipeiLocalDate,
  inspectStoresForTest,
};

/**
 * Task 40 accept 模組專用的執行期接縫（additive，不改動任何既有匯出）。
 *
 * in-memory store（bookingStore／orderStore／confirmationTokenStore／
 * idempotencyStore／planFixtureStore）是模組私有 Map、未匯出；accept 分支若自建
 * store，「轉換後接受」的串接測試會失真。但把 accept 實作直接寫進本檔會讓本檔
 * 達 933 行，超過 architecture-ratchet-guard 的 800 行一般上限（該 guard 是本卡
 * GREEN_CONDITION 的必跑項），故改為單向匯出執行期把手，由
 * db-midao-traveler-confirmation.mjs 匯入。本檔不反向 import 該模組，無 ESM 循環。
 */
export const __confirmationRuntime = {
  ACTIVE_BOOKING_STATUSES,
  UUID_PATTERN,
  HASH_PATTERN,
  bookingStore,
  orderStore,
  confirmationTokenStore,
  idempotencyStore,
  planFixtureStore,
  clone,
  nowIso,
  normalizeTimestamp,
};

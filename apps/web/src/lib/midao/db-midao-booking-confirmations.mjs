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
import { issueConfirmationToken,
  __setMidaoBookingConfirmationClockForTest, __setMidaoConfirmationTokenFactoryForTest,
  __resetMidaoBookingConfirmationStoreForTest, seedConversionFixture, inspectStoresForTest,
  convertInMemory, taipeiLocalDate,
} from './confirmation-runtime.mjs';
export { __setMidaoBookingConfirmationClockForTest, __setMidaoConfirmationTokenFactoryForTest };

import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';
import { SITE_URL } from '../seo/site-metadata.ts';
import { ERROR_STATUS, routeError, notFound, unexpected, violationToRouteError,
  assertConversionAllowed, normalizeUuid } from './confirmation-conversion-policy.mjs';
import { parseIdempotencyKey } from './idempotency.ts';
import { MidaoRouteError } from './route-errors.ts';

import { UUID_PATTERN, HASH_PATTERN, normalizeTimestamp } from './confirmation-values.mjs';
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

function requireTimestamp(value) {
  const normalized = normalizeTimestamp(value);
  if (!normalized) throw unexpected('Midao inquiry conversion returned an invalid timestamp');
  return normalized;
}

/** 與 migration 層 3 相同的唯一 local_date 計算式（Asia/Taipei）。 */
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

function buildConfirmationUrl(rawToken) {
  return `${SITE_URL}/booking/confirm/${rawToken}`;
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

// ---------------------------------------------------------------------------
// 測試接縫
// ---------------------------------------------------------------------------

export { __resetMidaoBookingConfirmationStoreForTest };
export function __seedMidaoInquiryConversionFixtureForTest(fixture = {}) {
  return seedConversionFixture(fixture);
}

// ---------------------------------------------------------------------------
// in-memory 分支（§4.9）
// ---------------------------------------------------------------------------

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
  const { sanitized, created, rawToken } = convertInMemory(command);
  return conversionResult(sanitized, { created, rawToken });
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

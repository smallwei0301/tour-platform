/**
 * #1759 Package 4／Task 40：traveler confirmation accept 的純函式層。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-07-issue1759-task40-traveler-confirmation-plan.md
 * §4.1（匯出符號）／§5.2（錯誤對照表）／§7（測試矩陣）。
 *
 * 安全不變式：
 * - 本檔不得 import supabase、不得有任何 I/O。
 * - raw token 只是輸入字串；任何丟出的錯誤訊息一律為固定安全字串，
 *   不得回填原始值（否則等同把 token 送進 log／Sentry）。
 * - 「token 不存在」與「token 屬於他人」一律塌成 404 `Resource not found`，
 *   不得讓呼叫端用錯誤碼／訊息／狀態碼探測他人資料是否存在。
 */
import { createHash } from 'node:crypto';

import { MidaoRouteError } from './route-errors.ts';

const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** §5.2：accept 專用公開錯誤碼 → 安全訊息（與 conversion 表分離）。 */
export const ACCEPT_SAFE_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'Resource not found',
  CONFIRMATION_TOKEN_EXPIRED: 'Confirmation link has expired',
  CONFIRMATION_TOKEN_ALREADY_CONSUMED: 'Confirmation link was already used',
  CAPACITY_EXCEEDED: 'Requested date is fully booked',
  IDEMPOTENCY_CONFLICT: 'Idempotency key was already used for a different request',
  IDEMPOTENCY_IN_PROGRESS: 'A request with this Idempotency-Key is already processing',
};

/** §5.2：accept 專用公開錯誤碼 → HTTP status。 */
export const ACCEPT_ERROR_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  CONFIRMATION_TOKEN_EXPIRED: 410,
  CONFIRMATION_TOKEN_ALREADY_CONSUMED: 409,
  CAPACITY_EXCEEDED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
};

/**
 * §5.2：RPC MESSAGE token → 公開錯誤碼。
 * 未列出的 token（22023 全家族、MIDAO_IDEMPOTENCY_RELATION_INVALID、無法反解）
 * 一律視為 gateway 傳參或關聯損毀，回 500 並上報。
 */
export const ACCEPT_RPC_ERROR_CODES: Record<string, string> = {
  CONFIRMATION_TOKEN_NOT_FOUND: 'NOT_FOUND',
  CONFIRMATION_TOKEN_EXPIRED: 'CONFIRMATION_TOKEN_EXPIRED',
  CONFIRMATION_TOKEN_ALREADY_CONSUMED: 'CONFIRMATION_TOKEN_ALREADY_CONSUMED',
  CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  PLAN_NOT_FOUND: 'NOT_FOUND',
};

/**
 * §5.2 子字串比對陷阱：`CONFIRMATION_TOKEN_NOT_FOUND` /
 * `…_EXPIRED` / `…_ALREADY_CONSUMED` / `INVALID_CONFIRMATION_TOKEN_HASH`
 * 互為前綴風險，必須以長度降冪比對並取第一個命中者。
 */
export const ACCEPT_RPC_ERROR_TOKENS: readonly string[] = Object.keys(ACCEPT_RPC_ERROR_CODES)
  .sort((left, right) => right.length - left.length);

/** accept 專用 route error 工廠。 */
export function acceptRouteError(code: string): MidaoRouteError {
  return new MidaoRouteError(
    code,
    ACCEPT_SAFE_MESSAGES[code] ?? 'Request rejected',
    ACCEPT_ERROR_STATUS[code] ?? 422,
  );
}

function acceptNotFound(): MidaoRouteError {
  return acceptRouteError('NOT_FOUND');
}

function acceptUnexpected(message = 'Midao traveler confirmation backend failure'): Error {
  const error = new Error(message);
  error.name = 'MidaoTravelerConfirmationBackendError';
  return error;
}

/**
 * URL path 段的 raw token → 正規化為小寫 64 hex。
 * 非 64 hex 一律丟 404 NOT_FOUND（回 422 等同 token oracle，見計畫 §5.3）。
 * 訊息固定為 'Resource not found'，絕不回填原值。
 */
export function normalizeConfirmationRawToken(value: unknown): string {
  if (typeof value !== 'string') throw acceptNotFound();
  const normalized = value.trim().toLowerCase();
  if (!HASH_PATTERN.test(normalized)) throw acceptNotFound();
  return normalized;
}

/** sha256(rawToken) → 64 hex 小寫。 */
export function hashConfirmationToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** 由 error.code/message/details/hint 反解 RPC token；找不到回 null。 */
export function acceptRpcErrorToken(error: unknown): string | null {
  const candidate = (error ?? {}) as Record<string, unknown>;
  const values = [candidate.code, candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toUpperCase();
  return ACCEPT_RPC_ERROR_TOKENS.find((token) => values.includes(token)) ?? null;
}

export interface AcceptProjection {
  accepted: boolean;
  replayed: boolean;
  bookingId: string;
  orderId: string;
  bookingStatus: string;
  travelerConfirmationStatus: string;
  paymentDeadlineAt: string | null;
}

/** RPC jsonb 回傳的固定鍵集合（migration 的 v_sanitized_body，replay 分支同形）。 */
const ACCEPT_PROJECTION_KEYS = [
  'accepted',
  'booking_id',
  'booking_status',
  'order_id',
  'payment_deadline_at',
  'replayed',
  'traveler_confirmation_status',
];

function projectionUuid(raw: unknown): string {
  if (typeof raw !== 'string' || !UUID_PATTERN.test(raw.trim().toLowerCase())) {
    throw acceptUnexpected('Midao traveler confirmation projection UUID is invalid');
  }
  return raw.trim().toLowerCase();
}

function projectionTimestamp(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw acceptUnexpected('Midao traveler confirmation payment deadline is invalid');
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw acceptUnexpected('Midao traveler confirmation payment deadline is invalid');
  }
  return new Date(parsed).toISOString();
}

/** 驗證 RPC jsonb 回傳形狀，回正規化 camelCase 投影；形狀不符丟 Error（→500）。 */
export function validateAcceptProjection(value: unknown): AcceptProjection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw acceptUnexpected('Midao traveler confirmation projection is not an object');
  }
  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload).sort();
  if (keys.join(',') !== ACCEPT_PROJECTION_KEYS.join(',')) {
    throw acceptUnexpected('Midao traveler confirmation projection shape is invalid');
  }
  if (typeof payload.accepted !== 'boolean' || typeof payload.replayed !== 'boolean') {
    throw acceptUnexpected('Midao traveler confirmation projection flags are invalid');
  }
  if (payload.booking_status !== 'draft' || payload.traveler_confirmation_status !== 'confirmed') {
    throw acceptUnexpected('Midao traveler confirmation projection enum is invalid');
  }
  return {
    accepted: payload.accepted,
    replayed: payload.replayed,
    bookingId: projectionUuid(payload.booking_id),
    orderId: projectionUuid(payload.order_id),
    bookingStatus: payload.booking_status,
    travelerConfirmationStatus: payload.traveler_confirmation_status,
    paymentDeadlineAt: projectionTimestamp(payload.payment_deadline_at),
  };
}

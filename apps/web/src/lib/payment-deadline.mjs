// #1493 — 未付款訂單付款期限（payment deadline）純函式。
//
// 設計（owner AC）：
//   - instant / scheduled：付款期限自「訂單建立」起算 24 小時。
//   - request：建立時不起算（等導遊審核），自「導遊審核通過、開放付款」起算 24 小時。
// 因此 request 在待審核期間 payment_deadline_at = null，逾時清理機制不會掃到它。
//
// 純函式、無 IO；draft route、approval gateway、逾時取消 sweep（Supabase RPC 對映與
// in-memory fallback）共用同一套截止時間語意。

import { requiresGuideApproval } from './booking-type-flow.mjs';

/** 付款期限視窗（小時）。 */
export const PAYMENT_WINDOW_HOURS = 24;
/** 付款期限視窗（毫秒）。 */
export const PAYMENT_WINDOW_MS = PAYMENT_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * 由某個起算時間推算付款截止時間（起算 + 24h）。
 * @param {string | number | Date} fromIso 起算時間
 * @returns {string} ISO 字串
 */
export function computePaymentDeadline(fromIso) {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) {
    throw new Error('computePaymentDeadline: invalid fromIso');
  }
  return new Date(from.getTime() + PAYMENT_WINDOW_MS).toISOString();
}

/**
 * 新建 draft 訂單時要寫入的 payment_deadline_at。
 * request → null（待審核，審核通過才起算）；instant / scheduled → 建立 + 24h。
 * @param {unknown} bookingType
 * @param {string | number | Date} createdAtIso 訂單建立時間
 * @returns {string | null}
 */
export function initialPaymentDeadlineForBookingType(bookingType, createdAtIso) {
  if (requiresGuideApproval(bookingType)) return null;
  return computePaymentDeadline(createdAtIso);
}

/**
 * 訂單是否已逾付款期限（須有截止時間且 now 已達/超過）。
 * 沒有截止時間（null，例如待審核 request）→ 永不逾時。
 * @param {string | number | Date | null | undefined} deadlineIso
 * @param {string | number | Date} nowIso
 * @returns {boolean}
 */
export function isPaymentExpired(deadlineIso, nowIso) {
  if (deadlineIso == null) return false;
  const deadline = new Date(deadlineIso);
  const now = new Date(nowIso);
  if (Number.isNaN(deadline.getTime()) || Number.isNaN(now.getTime())) return false;
  return now.getTime() >= deadline.getTime();
}

/**
 * 計算距付款截止的剩餘時間，供前端／後台顯示。
 * @param {string | number | Date | null | undefined} deadlineIso
 * @param {string | number | Date} nowIso
 * @returns {{
 *   hasDeadline: boolean,
 *   deadlineAt: string | null,
 *   isOverdue: boolean,
 *   remainingMs: number,
 *   hours: number,
 *   minutes: number,
 * }}
 */
export function describePaymentRemaining(deadlineIso, nowIso) {
  if (deadlineIso == null) {
    return { hasDeadline: false, deadlineAt: null, isOverdue: false, remainingMs: 0, hours: 0, minutes: 0 };
  }
  const deadline = new Date(deadlineIso);
  const now = new Date(nowIso);
  if (Number.isNaN(deadline.getTime()) || Number.isNaN(now.getTime())) {
    return { hasDeadline: false, deadlineAt: null, isOverdue: false, remainingMs: 0, hours: 0, minutes: 0 };
  }
  const remainingMs = deadline.getTime() - now.getTime();
  const isOverdue = remainingMs <= 0;
  const clamped = Math.max(0, remainingMs);
  return {
    hasDeadline: true,
    deadlineAt: deadline.toISOString(),
    isOverdue,
    remainingMs,
    hours: Math.floor(clamped / (60 * 60 * 1000)),
    minutes: Math.floor((clamped % (60 * 60 * 1000)) / (60 * 1000)),
  };
}

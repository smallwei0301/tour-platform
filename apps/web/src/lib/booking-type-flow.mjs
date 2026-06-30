// Booking-type flow decisions (issue: 三種預約模式 booking_type 實裝).
//
// Pure, IO-free helpers that encode how the three `activity_plans.booking_type`
// modes differ. Centralised here so the draft route, checkout gate, payment
// callback (both the Supabase RPC mirror and the in-memory fallback) and the
// guide approval route all share one source of truth.
//
// Design (owner 拍板):
//   - instant   : 無關卡，付款成功即自動確認。
//   - scheduled : 本版比照 instant（固定場次限制延後）。
//   - request   : 先審核後付款 —— 旅客送出申請後 guide_approval_status='pending'，
//                 導遊審核通過才放行付款；付款成功後同樣到 confirmed。
//
// 核心洞察：付款後三種最終都到 confirmed，差別只在「付款前的關卡」。

/** @typedef {'scheduled' | 'request' | 'instant'} BookingType */
/** @typedef {'not_required' | 'pending' | 'approved' | 'rejected'} GuideApprovalStatus */

export const BOOKING_TYPES = /** @type {const} */ (['scheduled', 'request', 'instant']);
export const GUIDE_APPROVAL_STATUSES = /** @type {const} */ ([
  'not_required',
  'pending',
  'approved',
  'rejected',
]);

/**
 * Coerce an arbitrary value to a known BookingType. Unknown/missing values fall
 * back to 'instant' to match the `activity_plans.booking_type` DB default.
 * @param {unknown} value
 * @returns {BookingType}
 */
export function normalizeBookingType(value) {
  return value === 'scheduled' || value === 'request' || value === 'instant'
    ? value
    : 'instant';
}

/**
 * Does this booking type gate payment behind a guide approval step?
 * @param {unknown} bookingType
 * @returns {boolean}
 */
export function requiresGuideApproval(bookingType) {
  return normalizeBookingType(bookingType) === 'request';
}

/**
 * Initial guide_approval_status to stamp on a freshly created draft booking.
 * request → 'pending' (待導遊審核)；其餘 → 'not_required'（零影響既有流程）。
 * @param {unknown} bookingType
 * @returns {GuideApprovalStatus}
 */
export function initialApprovalStatusForBookingType(bookingType) {
  return requiresGuideApproval(bookingType) ? 'pending' : 'not_required';
}

/**
 * 動態可預約時段規則（`guide_availability_rules`）是否適用於此 booking_type？
 *
 * 嚴格區隔（owner 拍板）：
 *   - scheduled：只看固定場次（`activity_schedules`），動態規則對它無效 → false。
 *   - instant / request：只看導遊可行時間（動態規則）→ true。
 *
 * 引擎層早已落實此區隔；本函式是「設定守門」與「預覽正確」共用的判準，
 * 讓 admin/guide 不會把動態規則綁到排程方案、預覽也不會誤跑動態時段。
 * @param {unknown} bookingType
 * @returns {boolean}
 */
export function isDynamicAvailabilityApplicable(bookingType) {
  return normalizeBookingType(bookingType) !== 'scheduled';
}

/**
 * Checkout gate: request bookings cannot enter payment until a guide approves.
 * @param {unknown} bookingType
 * @param {unknown} approvalStatus
 * @returns {{ allowed: true } | { allowed: false; code: string; messageZh: string }}
 */
export function canCheckout(bookingType, approvalStatus) {
  if (requiresGuideApproval(bookingType) && approvalStatus !== 'approved') {
    return {
      allowed: false,
      code: 'APPROVAL_REQUIRED',
      messageZh: '此行程需導遊審核通過後才能付款',
    };
  }
  return { allowed: true };
}

/**
 * After a successful payment callback, should the booking auto-confirm
 * (draft → confirmed) instead of stopping at pending_confirmation?
 *
 * 三種付款後皆 confirmed —— request 已先審核，instant/scheduled 無關卡。
 * 仍保留 bookingType 參數作未來 seam（例如日後 scheduled 要回到導遊複核）。
 * @param {unknown} _bookingType
 * @returns {boolean}
 */
// eslint-disable-next-line no-unused-vars
export function shouldAutoConfirmOnPayment(_bookingType) {
  return true;
}

/**
 * Pure validation + target-state computation for a guide approval decision on a
 * request booking. The route layer does the IO; this decides legality and the
 * fields to write.
 *
 * @param {{
 *   bookingStatus: string,
 *   guideApprovalStatus: string,
 *   bookingType: unknown,
 *   action: 'approve' | 'reject',
 * }} input
 * @returns {{
 *   ok: true,
 *   nextGuideApprovalStatus: GuideApprovalStatus,
 *   nextBookingStatus: string,
 * } | {
 *   ok: false,
 *   code: string,
 *   messageZh: string,
 * }}
 */
export function decideApproval(input) {
  const { bookingStatus, guideApprovalStatus, bookingType, action } = input;

  if (action !== 'approve' && action !== 'reject') {
    return { ok: false, code: 'INVALID_ACTION', messageZh: '無效的審核動作' };
  }

  if (!requiresGuideApproval(bookingType)) {
    return {
      ok: false,
      code: 'NOT_APPROVABLE',
      messageZh: '此預約方案不需要導遊審核',
    };
  }

  // Guard: only a pending, still-unpaid (draft) request can be decided. This
  // blocks double decisions and post-payment re-review.
  if (guideApprovalStatus !== 'pending' || bookingStatus !== 'draft') {
    return {
      ok: false,
      code: 'NOT_PENDING_APPROVAL',
      messageZh: '此預約非待審核狀態，無法審核',
    };
  }

  if (action === 'approve') {
    // 通過：放行付款，booking 維持 draft 等旅客付款。
    return {
      ok: true,
      nextGuideApprovalStatus: 'approved',
      nextBookingStatus: 'draft',
    };
  }

  // 婉拒：booking draft → cancelled（合法轉換）。
  return {
    ok: true,
    nextGuideApprovalStatus: 'rejected',
    nextBookingStatus: 'cancelled',
  };
}

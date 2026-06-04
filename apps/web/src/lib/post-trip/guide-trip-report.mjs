/**
 * Issue #1171 — Guide trip-report backend slice (helpers only).
 *
 * Two pure decisions shared by the future POST submit endpoint, the existing
 * GET trip-reports-due endpoint, and Admin post-trip summary:
 *
 *   1. evaluateGuideTripReportSubmissionAuthz(...) — may the requesting
 *      guide legitimately file a trip report against this booking? Blocks
 *      bookings owned by a different guide, cancelled or refunded bookings,
 *      and bookings whose schedule has not finished yet.
 *
 *   2. evaluateGuideTripReportIdempotency(...) — given the delivery log
 *      rows for this booking, should the submit fire now? Default: one
 *      submitted record per booking; revisions require an explicit reason.
 *
 * No Supabase, no email, no auth — the route that integrates this in a
 * follow-up PR remains responsible for verifyGuideSession() and the actual
 * .from('guide_trip_reports').insert(...) call.
 */

const BOOKING_CANCELLED_STATUSES = new Set([
  'cancelled',
  'cancelled_by_user',
  'cancelled_by_guide',
]);

const MS_PER_MINUTE = 60 * 1000;

/**
 * @returns { canSubmit: true } | { canSubmit: false, reason: string }
 */
export function evaluateGuideTripReportSubmissionAuthz(input) {
  const requestingGuideId =
    typeof input?.requestingGuideId === 'string' ? input.requestingGuideId : '';
  const bookingGuideId =
    typeof input?.bookingGuideId === 'string' ? input.bookingGuideId : '';
  const bookingStatus =
    typeof input?.bookingStatus === 'string' ? input.bookingStatus : '';

  if (!requestingGuideId || !bookingGuideId) {
    return { canSubmit: false, reason: 'MISSING_GUIDE_ID' };
  }
  if (requestingGuideId !== bookingGuideId) {
    return { canSubmit: false, reason: 'NOT_OWNING_GUIDE' };
  }
  if (BOOKING_CANCELLED_STATUSES.has(bookingStatus)) {
    return { canSubmit: false, reason: 'BOOKING_CANCELLED' };
  }
  if (input?.isRefunded === true) {
    return { canSubmit: false, reason: 'BOOKING_REFUNDED' };
  }

  const scheduleEndAt = parseTimestamp(input?.scheduleEndAt);
  const now = parseTimestamp(input?.now);
  if (!Number.isFinite(scheduleEndAt)) {
    return { canSubmit: false, reason: 'MISSING_SCHEDULE_END' };
  }
  if (!Number.isFinite(now)) {
    return { canSubmit: false, reason: 'MISSING_NOW' };
  }
  if (now < scheduleEndAt) {
    return { canSubmit: false, reason: 'BOOKING_NOT_ENDED' };
  }

  return { canSubmit: true };
}

/**
 * @returns { allowSubmit: boolean, code: string, reasonZh?: string }
 */
export function evaluateGuideTripReportIdempotency(input) {
  const records = Array.isArray(input?.existingReports)
    ? input.existingReports.filter(Boolean)
    : [];
  const allowResubmit = input?.allowResubmit === true;
  const resubmitReason =
    typeof input?.resubmitReason === 'string' ? input.resubmitReason.trim() : '';

  const submitted = records.find((r) => r.status === 'submitted');

  if (!submitted) {
    return { allowSubmit: true, code: 'first_submit' };
  }

  if (!allowResubmit) {
    return {
      allowSubmit: false,
      code: 'already_submitted',
      reasonZh: '此訂單已提交出團報告，預設不重送；若要修正請啟用覆寫並提供理由。',
    };
  }

  if (resubmitReason.length === 0) {
    return {
      allowSubmit: false,
      code: 'revise_blocked_no_reason',
      reasonZh: '修正出團報告需要提供理由（resubmitReason）。',
    };
  }

  return { allowSubmit: true, code: 'revise_with_reason' };
}

function parseTimestamp(value) {
  if (value == null) return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : NaN;
  }
  return NaN;
}

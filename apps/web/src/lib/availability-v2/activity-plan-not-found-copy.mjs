/**
 * Issue #1237 acceptance criterion 4 — friendly zh-TW copy for the
 * "Activity plan not found" / "Activity plan is not active" error
 * envelopes returned by:
 *
 *   - GET  /api/v2/activities/:activityId/available-slots
 *   - POST /api/v2/bookings/draft
 *
 * Before this slice the routes returned raw English (`'Activity plan
 * not found'`) which the traveler UI surfaced directly. Operators in
 * #1237 reported real travelers seeing the English string on the
 * booking page when production seed data drifts.
 *
 * The data-alignment side of #1237 (criterion 1) is a production-seed
 * fix and remains an ops concern; this helper covers criterion 4 so
 * even when the alignment regresses, the traveler sees a Traditional
 * Chinese, actionable message.
 *
 * zh strings mirror booking-plan-resolver.ts's MESSAGES map so the
 * two error surfaces speak the same language.
 */

const COPY = {
  PLAN_NOT_FOUND: {
    en: 'Activity plan not found',
    zh: '找不到此方案，可能已下架，請從活動頁重新選擇方案。',
  },
  PLAN_NOT_ACTIVE: {
    en: 'Activity plan is not active',
    zh: '此方案目前未開放預約，請從活動頁選擇其他方案。',
  },
};

export const ACTIVITY_PLAN_NOT_FOUND_REASONS = Object.freeze(Object.keys(COPY));

/**
 * @returns { body, status } — body is the JSON envelope ready for
 *          Response.json(...) and status is the HTTP code. Returning
 *          a plain object keeps this helper Next-runtime agnostic
 *          (no Response import, safe to use from .mjs or .ts).
 */
export function buildActivityPlanNotFoundResponse(reason) {
  const key = typeof reason === 'string' && reason in COPY ? reason : 'PLAN_NOT_FOUND';
  const copy = COPY[key];
  return {
    body: {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: copy.en,
        messageZh: copy.zh,
      },
    },
    status: 404,
  };
}

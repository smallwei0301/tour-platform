/**
 * @typedef {{ id?: string | null, start_at?: string | null, end_at?: string | null }} ActivityScheduleRow
 * @typedef {{ refund_amount_twd?: number | null, has_complaint?: boolean | null, has_oversell_issue?: boolean | null }} OperationsTrackingRow
 * @typedef {{
 *   id: string,
 *   status: string,
 *   booking_id?: string | null,
 *   activity_schedules?: ActivityScheduleRow | ActivityScheduleRow[] | null,
 *   operations_tracking?: OperationsTrackingRow | OperationsTrackingRow[] | null,
 * }} AdminPostTripSummaryOrder
 * @typedef {{ booking_id: string | null, submitted_at: string | null }} GuideTripReportRow
 */

import {
  isReviewInvitationEligible,
  isPayoutOnHold,
  tripReportStatus,
  adminFollowupCategory,
} from './post-trip-eligibility.mjs';

function firstRow(value) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * @param {GuideTripReportRow[] | undefined} guideTripReports
 * @returns {Map<string, GuideTripReportRow[]>}
 */
function normalizeGuideTripReportsByBookingId(guideTripReports = []) {
  /** @type {Map<string, GuideTripReportRow[]>} */
  const reportsByBookingId = new Map();

  for (const row of guideTripReports ?? []) {
    if (!row?.booking_id) continue;
    const existing = reportsByBookingId.get(row.booking_id) ?? [];
    existing.push(row);
    reportsByBookingId.set(row.booking_id, existing);
  }

  return reportsByBookingId;
}

/**
 * @param {{
 *   orders?: AdminPostTripSummaryOrder[],
 *   guideTripReports?: GuideTripReportRow[],
 *   now?: Date,
 *   categoryFilter?: string | null,
 * }} args
 * @returns {{
 *   overdueTripReports: Array<{ orderId: string, scheduleEndAt: string }>,
 *   readyForReviewInvitation: Array<{ orderId: string, scheduleEndAt: string }>,
 *   payoutOnHold: Array<{ orderId: string, holdReason: string }>,
 *   adminFollowupNeeded: Array<{ orderId: string, category: string }>,
 *   orderCount: number,
 * }}
 */
export function buildAdminPostTripSummary({
  orders = [],
  guideTripReports = [],
  now = new Date(),
  categoryFilter = null,
} = {}) {
  const overdueTripReports = [];
  const readyForReviewInvitation = [];
  const payoutOnHold = [];
  const adminFollowupNeeded = [];
  const reportsByBookingId = normalizeGuideTripReportsByBookingId(guideTripReports);

  for (const order of orders ?? []) {
    const schedule = firstRow(order.activity_schedules);
    const ops = firstRow(order.operations_tracking);
    const scheduleEndAt = schedule?.end_at ?? schedule?.start_at;

    if (!scheduleEndAt) continue;
    if (new Date(scheduleEndAt) >= now) continue;

    const reportRows = reportsByBookingId.get(order.booking_id) ?? [];
    const submittedRow = reportRows.find((row) => row?.submitted_at);
    const submittedAt = submittedRow?.submitted_at ?? null;

    const reportStatus = tripReportStatus({
      scheduleEndAt,
      submittedAt,
      now,
    });

    if (reportStatus === 'overdue') {
      overdueTripReports.push({ orderId: order.id, scheduleEndAt });
    }

    if (
      isReviewInvitationEligible({
        orderStatus: order.status,
        scheduleEndAt,
        now,
        hasComplaint: ops?.has_complaint ?? false,
        refundAmountTwd: ops?.refund_amount_twd ?? 0,
      })
    ) {
      readyForReviewInvitation.push({ orderId: order.id, scheduleEndAt });
    }

    const holdReason = isPayoutOnHold({
      refundAmountTwd: ops?.refund_amount_twd ?? 0,
      hasComplaint: ops?.has_complaint ?? false,
      hasOversellIssue: ops?.has_oversell_issue ?? false,
    });

    if (holdReason) {
      payoutOnHold.push({ orderId: order.id, holdReason });
    }

    const followupCategory = adminFollowupCategory({
      missingTripReport: reportStatus === 'overdue',
      hasComplaint: ops?.has_complaint ?? false,
    });

    if (followupCategory) {
      adminFollowupNeeded.push({ orderId: order.id, category: followupCategory });
    }
  }

  return {
    overdueTripReports,
    readyForReviewInvitation,
    payoutOnHold,
    adminFollowupNeeded: categoryFilter
      ? adminFollowupNeeded.filter((row) => row.category === categoryFilter)
      : adminFollowupNeeded,
    orderCount: (orders ?? []).length,
  };
}

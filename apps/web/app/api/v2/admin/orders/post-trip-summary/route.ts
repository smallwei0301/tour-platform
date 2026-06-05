import { successV2, errorV2 } from '../../../../../../src/lib/api';
import { createClient } from '../../../../../../src/lib/supabase/server';
import {
  isReviewInvitationEligible,
  isPayoutOnHold,
  tripReportStatus,
  adminFollowupCategory,
} from '../../../../../../src/lib/post-trip-eligibility.mjs';

const VALID_CATEGORIES = new Set(['guide_report_risk', 'payment_order_mismatch', 'review_moderation', 'refund_dispute_safety']);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get('since');
  const categoryFilter = url.searchParams.get('category');
  const now = new Date();
  const since = sinceParam
    ? new Date(sinceParam)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (sinceParam && isNaN(since.getTime())) {
    return Response.json(errorV2('INVALID_DATE', 'Invalid since parameter'), { status: 422 });
  }

  if (categoryFilter && !VALID_CATEGORIES.has(categoryFilter)) {
    return Response.json(
      errorV2('INVALID_CATEGORY', `category must be one of: ${[...VALID_CATEGORIES].join(', ')}`),
      { status: 422 }
    );
  }

  try {
    const supabase = await createClient();

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id, status, booking_id,
        activity_schedules(id, start_at, end_at),
        operations_tracking(refund_amount_twd, has_complaint, has_oversell_issue)
      `)
      .in('status', ['paid', 'confirmed', 'completed'])
      .gte('created_at', since.toISOString())
      .limit(200);

    if (error) {
      return Response.json(errorV2('DB_ERROR', error.message), { status: 500 });
    }

    const bookingIds = [
      ...new Set(
        (orders ?? [])
          .map((order) => order.booking_id)
          .filter((bookingId): bookingId is string => typeof bookingId === 'string' && bookingId.length > 0)
      ),
    ];
    const reportsByBookingId = new Map<string, Array<{ submitted_at: string | null }>>();

    if (bookingIds.length > 0) {
      const { data: guideTripReports, error: guideTripReportsError } = await supabase
        .from('guide_trip_reports')
        .select('booking_id, submitted_at')
        .in('booking_id', bookingIds);

      if (guideTripReportsError) {
        return Response.json(errorV2('DB_ERROR', guideTripReportsError.message), { status: 500 });
      }

      for (const report of guideTripReports ?? []) {
        if (!report.booking_id) continue;
        const existing = reportsByBookingId.get(report.booking_id) ?? [];
        existing.push({ submitted_at: report.submitted_at ?? null });
        reportsByBookingId.set(report.booking_id, existing);
      }
    }

    const overdueTripReports: Array<{ orderId: string; scheduleEndAt: string }> = [];
    const readyForReviewInvitation: Array<{ orderId: string; scheduleEndAt: string }> = [];
    const payoutOnHold: Array<{ orderId: string; holdReason: string }> = [];
    const adminFollowupNeeded: Array<{ orderId: string; category: string }> = [];

    for (const order of orders ?? []) {
      const schedule = Array.isArray(order.activity_schedules)
        ? order.activity_schedules[0]
        : order.activity_schedules;
      const ops = Array.isArray(order.operations_tracking)
        ? order.operations_tracking[0]
        : order.operations_tracking;

      const scheduleEndAt = schedule?.end_at ?? schedule?.start_at;
      if (!scheduleEndAt) continue;

      if (new Date(scheduleEndAt) >= now) continue;

      const reportRows = order.booking_id
        ? reportsByBookingId.get(order.booking_id) ?? []
        : [];
      const submittedRow = (reportRows as Array<{ submitted_at: string | null }>).find(
        (row) => row?.submitted_at,
      );
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

    const filteredFollowup = categoryFilter
      ? adminFollowupNeeded.filter((order) => order.category === categoryFilter)
      : adminFollowupNeeded;

    return Response.json(
      successV2({
        overdueTripReports,
        readyForReviewInvitation,
        payoutOnHold,
        adminFollowupNeeded: filteredFollowup,
        computedAt: now.toISOString(),
        since: since.toISOString(),
        categoryFilter: categoryFilter ?? null,
        orderCount: (orders ?? []).length,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}

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

    // #1254: Two-hop join through bookings. orders has no direct FK to
    // guide_trip_reports (relation is orders.booking_id → bookings.id ←
    // guide_trip_reports.booking_id), so PostgREST cannot embed
    // guide_trip_reports(...) off orders. Fetch the report rows in a
    // separate query keyed on booking_id and join in JS.
    const bookingIds = Array.from(
      new Set(
        (orders ?? [])
          .map((o) => o.booking_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const tripReportSubmittedAtByBookingId = new Map<string, string>();
    if (bookingIds.length > 0) {
      const { data: tripReports, error: tripReportsError } = await supabase
        .from('guide_trip_reports')
        .select('booking_id, submitted_at')
        .in('booking_id', bookingIds)
        .eq('status', 'submitted');

      if (tripReportsError) {
        return Response.json(errorV2('DB_ERROR', tripReportsError.message), { status: 500 });
      }

      for (const row of tripReports ?? []) {
        if (row?.booking_id && row?.submitted_at) {
          tripReportSubmittedAtByBookingId.set(row.booking_id, row.submitted_at);
        }
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

      // Only process orders where the activity has already ended
      if (new Date(scheduleEndAt) >= now) continue;

      // Read submitted_at from the booking_id → submitted_at map built
      // from the separate guide_trip_reports query above (issue #1254).
      const submittedAt = order.booking_id
        ? tripReportSubmittedAtByBookingId.get(order.booking_id) ?? null
        : null;

      // Trip report overdue
      const reportStatus = tripReportStatus({
        scheduleEndAt,
        submittedAt,
        now,
      });
      if (reportStatus === 'overdue') {
        overdueTripReports.push({ orderId: order.id, scheduleEndAt });
      }

      // Review invitation eligible
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

      // Payout on hold
      const holdReason = isPayoutOnHold({
        refundAmountTwd: ops?.refund_amount_twd ?? 0,
        hasComplaint: ops?.has_complaint ?? false,
        hasOversellIssue: ops?.has_oversell_issue ?? false,
      });
      if (holdReason) {
        payoutOnHold.push({ orderId: order.id, holdReason });
      }

      // Admin followup
      const followupCategory = adminFollowupCategory({
        missingTripReport: reportStatus === 'overdue',
        hasComplaint: ops?.has_complaint ?? false,
      });
      if (followupCategory) {
        adminFollowupNeeded.push({ orderId: order.id, category: followupCategory });
      }
    }

    // Apply category filter if provided
    const filteredFollowup = categoryFilter
      ? adminFollowupNeeded.filter(o => o.category === categoryFilter)
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

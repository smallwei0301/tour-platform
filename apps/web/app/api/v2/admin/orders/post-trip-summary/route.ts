import { successV2, errorV2 } from '../../../../../../src/lib/api';
import { createClient } from '../../../../../../src/lib/supabase/server';
import {
  isReviewInvitationEligible,
  isPayoutOnHold,
  tripReportStatus,
  adminFollowupCategory,
} from '../../../../../../src/lib/post-trip-eligibility.mjs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get('since');
  const now = new Date();
  const since = sinceParam
    ? new Date(sinceParam)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (sinceParam && isNaN(since.getTime())) {
    return Response.json(errorV2('INVALID_DATE', 'Invalid since parameter'), { status: 422 });
  }

  try {
    const supabase = await createClient();

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id, status,
        activity_schedules(id, start_at, end_at),
        operations_tracking(refund_amount_twd, has_complaint, has_oversell_issue)
      `)
      .in('status', ['paid', 'confirmed', 'completed'])
      .gte('created_at', since.toISOString())
      .limit(200);

    if (error) {
      return Response.json(errorV2('DB_ERROR', error.message), { status: 500 });
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

      // Trip report overdue
      const reportStatus = tripReportStatus({
        scheduleEndAt,
        submittedAt: null,
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

    return Response.json(
      successV2({
        overdueTripReports,
        readyForReviewInvitation,
        payoutOnHold,
        adminFollowupNeeded,
        computedAt: now.toISOString(),
        since: since.toISOString(),
        orderCount: (orders ?? []).length,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}

import { successV2, errorV2 } from '../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../src/lib/supabase/server';
import {
  isCompletionEligible,
  isReviewInvitationEligible,
  isPayoutOnHold,
  tripReportStatus,
  adminFollowupCategory,
} from '../../../../../../../src/lib/post-trip-eligibility.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  if (!UUID_RE.test(orderId)) {
    return Response.json(errorV2('INVALID_ORDER_ID', 'Invalid order ID format'), { status: 422 });
  }

  try {
    const supabase = await createClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id, status,
        activity_schedules(id, start_at, end_at),
        operations_tracking(refund_amount_twd, has_complaint, has_oversell_issue)
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      return Response.json(errorV2('DB_ERROR', orderError.message), { status: 500 });
    }
    if (!order) {
      return Response.json(errorV2('ORDER_NOT_FOUND', 'Order not found'), { status: 404 });
    }

    const now = new Date();
    const schedule = Array.isArray(order.activity_schedules)
      ? order.activity_schedules[0]
      : order.activity_schedules;
    const ops = Array.isArray(order.operations_tracking)
      ? order.operations_tracking[0]
      : order.operations_tracking;

    const scheduleEndAt = schedule?.end_at ?? schedule?.start_at ?? null;

    if (!scheduleEndAt) {
      return Response.json(successV2({
        orderId,
        completionEligible: false,
        reviewInvitationEligible: false,
        payoutHoldReason: null,
        tripReportStatus: 'pending' as const,
        adminFollowupCategory: null,
        note: 'no schedule end time available',
      }));
    }

    const completionEligible = isCompletionEligible({
      orderStatus: order.status,
      scheduleEndAt,
      now,
    });

    const reviewInvitationEligible = isReviewInvitationEligible({
      orderStatus: order.status,
      scheduleEndAt,
      now,
      hasComplaint: ops?.has_complaint ?? false,
      refundAmountTwd: ops?.refund_amount_twd ?? 0,
    });

    const payoutHoldReason = isPayoutOnHold({
      refundAmountTwd: ops?.refund_amount_twd ?? 0,
      hasComplaint: ops?.has_complaint ?? false,
      hasOversellIssue: ops?.has_oversell_issue ?? false,
    });

    const reportStatus = tripReportStatus({
      scheduleEndAt,
      submittedAt: null, // trip report table not yet implemented — always null
      now,
    });

    const followupCategory = adminFollowupCategory({
      missingTripReport: reportStatus === 'overdue',
      hasComplaint: ops?.has_complaint ?? false,
    });

    return Response.json(successV2({
      orderId,
      completionEligible,
      reviewInvitationEligible,
      payoutHoldReason,
      tripReportStatus: reportStatus,
      adminFollowupCategory: followupCategory,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}

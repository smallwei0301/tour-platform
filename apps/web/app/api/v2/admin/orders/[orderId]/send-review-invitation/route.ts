// POST /api/v2/admin/orders/:orderId/send-review-invitation
// Auth: admin middleware (admin_token + CSRF)
//
// 1. Validate orderId UUID
// 2. Fetch order + schedule + user profile + activity
// 3. Check isReviewInvitationEligible
// 4. Build reviewUrl (e.g. ${NEXT_PUBLIC_SITE_URL}/me/orders/${orderId}?review=1)
// 5. Call sendReviewInvitation({ contactEmail, contactName, activityTitle, orderId, reviewUrl })
// 6. Return result

import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../../src/lib/supabase/server';
import { successV2, errorV2 } from '../../../../../../../src/lib/api';
import { isReviewInvitationEligible } from '../../../../../../../src/lib/post-trip-eligibility.mjs';
import { sendReviewInvitation } from '../../../../../../../src/lib/email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  if (!UUID_RE.test(orderId)) {
    return NextResponse.json(errorV2('INVALID_ORDER_ID', 'Invalid order ID format'), { status: 422 });
  }

  try {
    const supabase = await createClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id, status,
        activity_schedules(id, start_at, end_at),
        operations_tracking(refund_amount_twd, has_complaint),
        users(email, raw_user_meta_data),
        activities(title)
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      return NextResponse.json(errorV2('DB_ERROR', orderError.message), { status: 500 });
    }

    if (!order) {
      return NextResponse.json(errorV2('ORDER_NOT_FOUND', 'Order not found'), { status: 404 });
    }

    const now = new Date();
    const schedule = Array.isArray(order.activity_schedules)
      ? order.activity_schedules[0]
      : order.activity_schedules;
    const ops = Array.isArray(order.operations_tracking)
      ? order.operations_tracking[0]
      : order.operations_tracking;
    const scheduleEndAt = schedule?.end_at ?? schedule?.start_at;

    if (!scheduleEndAt) {
      return NextResponse.json(
        errorV2('NO_SCHEDULE', 'Order has no schedule end time'),
        { status: 422 }
      );
    }

    const eligible = isReviewInvitationEligible({
      orderStatus: order.status,
      scheduleEndAt,
      now,
      hasComplaint: ops?.has_complaint ?? false,
      refundAmountTwd: ops?.refund_amount_twd ?? 0,
    });

    if (!eligible) {
      return NextResponse.json(
        errorV2(
          'NOT_ELIGIBLE',
          'Order is not eligible for review invitation (status, timing, or exclusion criteria)'
        ),
        { status: 422 }
      );
    }

    const user = Array.isArray(order.users) ? order.users[0] : order.users;
    const contactEmail = user?.email;

    if (!contactEmail) {
      return NextResponse.json(
        errorV2('NO_EMAIL', 'Order user has no email'),
        { status: 422 }
      );
    }

    const activity = Array.isArray(order.activities) ? order.activities[0] : order.activities;
    const activityTitle = activity?.title ?? '您的行程';
    const contactName =
      user?.raw_user_meta_data?.full_name ?? user?.raw_user_meta_data?.name;

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tour-platform-nine.vercel.app';
    const reviewUrl = `${siteUrl}/me/orders/${orderId}?review=1`;

    const result = await sendReviewInvitation({
      contactEmail,
      contactName,
      activityTitle,
      orderId,
      reviewUrl,
    });

    if (!result.ok) {
      return NextResponse.json(
        errorV2(
          result.errorCode ?? 'EMAIL_FAILED',
          result.errorMessage ?? 'Failed to send review invitation'
        ),
        { status: 500 }
      );
    }

    return NextResponse.json(
      successV2({
        orderId,
        emailSentTo: contactEmail,
        messageId: result.messageId,
        reviewUrl,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}

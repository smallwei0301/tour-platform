// POST /api/v2/admin/orders/:orderId/send-review-invitation
// Auth: admin middleware (admin_token + CSRF)
//
// 1. Validate orderId UUID
// 2. Fetch order + schedule + user profile + activity
// 3. Check isReviewInvitationEligible
// 4. Fetch existing review_invitations rows (service-role client)
// 5. Call evaluateReviewInvitationIdempotency → 409 if blocked
// 6. Build reviewUrl (e.g. ${NEXT_PUBLIC_SITE_URL}/me/orders/${orderId}?review=1)
// 7. Call sendReviewInvitation with contactEmail, contactName, activityTitle, orderId, reviewUrl
// 8. Insert delivery log row (sent or failed) into review_invitations
// 9. Return result

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createAnonClient } from '../../../../../../../src/lib/supabase/server';
import { successV2, errorV2 } from '../../../../../../../src/lib/api';
import { isReviewInvitationEligible } from '../../../../../../../src/lib/post-trip-eligibility.mjs';
import { evaluateReviewInvitationIdempotency } from '../../../../../../../src/lib/post-trip/review-invitation.mjs';
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
    const supabase = await createAnonClient();

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

    // ── Service-role client for review_invitations (bypasses RLS) ────────────
    // review_invitations is a new table (issue #1174) not yet in the generated
    // Supabase types — cast to any so the compiler does not block on it.
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let srClient: any = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      srClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    }

    // ── Idempotency guard: fetch existing delivery log rows ───────────────────
    let existingInvitations: Array<{ status: string }> = [];
    if (srClient) {
      const { data: existingRows } = await srClient
        .from('review_invitations')
        .select('status')
        .eq('order_id', orderId);
      existingInvitations = existingRows ?? [];
    }

    // ── evaluateReviewInvitationIdempotency must be called BEFORE sendReviewInvitation ──
    const idempotency = evaluateReviewInvitationIdempotency({
      existingInvitations,
    });

    if (!idempotency.allowSend) {
      return NextResponse.json(
        errorV2(
          idempotency.code === 'already_sent' ? 'already_sent' : idempotency.code,
          idempotency.reasonZh ?? 'Review invitation already sent for this order'
        ),
        { status: 409 }
      );
    }

    // ── Build review URL and send ─────────────────────────────────────────────
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
      // ── Insert 'failed' delivery log row ────────────────────────────────────
      if (srClient) {
        await srClient.from('review_invitations').insert({
          order_id: orderId,
          status: 'failed',
          initiated_by: 'admin_manual',
          failed_at: new Date().toISOString(),
          failure_reason: result.errorCode ?? 'EMAIL_SEND_FAILED',
        });
      }

      return NextResponse.json(
        errorV2(
          result.errorCode ?? 'EMAIL_FAILED',
          result.errorMessage ?? 'Failed to send review invitation'
        ),
        { status: 500 }
      );
    }

    // ── Insert 'sent' delivery log row ───────────────────────────────────────
    if (srClient) {
      await srClient.from('review_invitations').insert({
        order_id: orderId,
        status: 'sent',
        initiated_by: 'admin_manual',
        sent_at: new Date().toISOString(),
      });
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

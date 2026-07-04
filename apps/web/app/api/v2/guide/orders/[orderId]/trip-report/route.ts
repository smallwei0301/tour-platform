/**
 * POST /api/v2/guide/orders/[orderId]/trip-report
 * Issue #1171 — Guide trip-report submit endpoint
 *
 * Submit or revise a trip report for a completed order.
 * Auth: guide session cookie (HMAC) + CSRF double-submit token.
 *
 * Flow:
 *   1. validateCsrf → 403 if missing/mismatch
 *   2. verifyGuideSession → 401 if no valid session
 *   3. Load order (join booking to get guide_id, booking_id, scheduleEndAt)
 *   4. Null booking_id → 400 "order has no V2 booking"
 *   5. evaluateGuideTripReportSubmissionAuthz → 403/422 on denial
 *   6. Load existing guide_trip_reports rows for this booking
 *   7. evaluateGuideTripReportIdempotency → 409 if already_submitted without override
 *   8. Insert new guide_trip_reports row (status='submitted' or 'revised')
 *   9. Return 201 with { reportId }
 *
 * No traveler PII (email / phone / payment data) in response.
 */

import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import {
  evaluateGuideTripReportSubmissionAuthz,
  evaluateGuideTripReportIdempotency,
} from '../../../../../../../src/lib/post-trip/guide-trip-report.mjs';
import { ok, fail } from '../../../../../../../src/lib/api';

import { reportRouteError } from '../../../../../../../src/lib/route-error';
async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

interface TripReportBody {
  notes?: string | null;
  headcount?: number | null;
  allowResubmit?: boolean;
  resubmitReason?: string | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  // Step 1: CSRF
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  // Step 2: Guide auth
  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  const { orderId } = await params;

  // Parse body
  let body: TripReportBody = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional for first submit; continue with defaults
  }

  const allowResubmit = body?.allowResubmit === true;
  const resubmitReason =
    typeof body?.resubmitReason === 'string' ? body.resubmitReason : '';

  // No Supabase in dev/test env — return success stub
  if (!process.env.SUPABASE_URL) {
    return Response.json(
      ok({ reportId: null, message: 'No database configured (dev/test mode)' }),
      { status: 201 },
    );
  }

  try {
    const supabase = await getSupabase();

    // Step 3: Load order with booking details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        booking_id,
        bookings!fk_bookings_order_id(
          id,
          guide_id,
          is_refunded,
          activity_schedules(end_at)
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return Response.json(fail('NOT_FOUND', 'Order not found'), { status: 404 });
    }

    // Step 4: booking_id null guard
    if (!order.booking_id) {
      return Response.json(
        fail('BAD_REQUEST', 'Order has no V2 booking; cannot submit trip report'),
        { status: 400 },
      );
    }

    const booking = Array.isArray(order.bookings) ? order.bookings[0] : order.bookings;
    if (!booking) {
      return Response.json(fail('NOT_FOUND', 'Booking not found'), { status: 404 });
    }

    const bookingSchedule = Array.isArray(booking.activity_schedules)
      ? booking.activity_schedules[0]
      : booking.activity_schedules;

    const scheduleEndAt = bookingSchedule?.end_at ?? null;

    // Step 5: evaluateGuideTripReportSubmissionAuthz
    const authz = evaluateGuideTripReportSubmissionAuthz({
      requestingGuideId: session.guideId,
      bookingGuideId: booking.guide_id,
      bookingStatus: order.status,
      isRefunded: booking.is_refunded === true,
      scheduleEndAt,
      now: new Date().toISOString(),
    });

    if (!authz.canSubmit) {
      const statusMap: Record<string, number> = {
        NOT_OWNING_GUIDE: 403,
        BOOKING_CANCELLED: 422,
        BOOKING_REFUNDED: 422,
        BOOKING_NOT_ENDED: 422,
        MISSING_SCHEDULE_END: 422,
        MISSING_GUIDE_ID: 403,
        MISSING_NOW: 500,
      };
      const status = statusMap[authz.reason] ?? 422;
      return Response.json(
        fail('SUBMISSION_DENIED', authz.reason),
        { status },
      );
    }

    // Step 6: Load existing trip report rows for this booking
    const { data: existingReports, error: reportsError } = await supabase
      .from('guide_trip_reports')
      .select('id, status, submitted_at')
      .eq('booking_id', order.booking_id)
      .eq('guide_id', session.guideId);

    if (reportsError) {
      return Response.json(fail('SERVER_ERROR', reportsError.message), { status: 500 });
    }

    // Step 7: evaluateGuideTripReportIdempotency
    const idempotency = evaluateGuideTripReportIdempotency({
      existingReports: existingReports ?? [],
      allowResubmit,
      resubmitReason,
    });

    if (!idempotency.allowSubmit) {
      return Response.json(
        {
          ok: false,
          error: {
            code: idempotency.code.toUpperCase(),
            message: idempotency.reasonZh ?? idempotency.code,
          },
        },
        { status: 409 },
      );
    }

    // Step 8: Insert guide_trip_reports row
    const insertStatus = idempotency.code === 'revise_with_reason' ? 'revised' : 'submitted';
    const now = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from('guide_trip_reports')
      .insert({
        booking_id: order.booking_id,
        guide_id: session.guideId,
        order_id: orderId,
        status: insertStatus,
        submitted_at: now,
        notes: body?.notes ?? null,
        headcount: body?.headcount ?? null,
        resubmit_reason: resubmitReason || null,
      })
      .select('id')
      .single();

    if (insertError) {
      return Response.json(fail('SERVER_ERROR', insertError.message), { status: 500 });
    }

    // Step 9: Return 201
    return Response.json(
      ok({ reportId: inserted.id, status: insertStatus }),
      { status: 201 },
    );
  } catch (err) {
    await reportRouteError(err, { route: 'v2/guide/orders/trip-report' });
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}

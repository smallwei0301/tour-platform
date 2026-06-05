import { successV2, errorV2 } from '../../../../../../src/lib/api';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { buildAdminPostTripSummary } from '../../../../../../src/lib/admin-post-trip-summary.mjs';

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

    let guideTripReports: Array<{ booking_id: string | null; submitted_at: string | null }> = [];

    if (bookingIds.length > 0) {
      const { data, error: guideTripReportsError } = await supabase
        .from('guide_trip_reports')
        .select('booking_id, submitted_at')
        .in('booking_id', bookingIds);

      if (guideTripReportsError) {
        return Response.json(errorV2('DB_ERROR', guideTripReportsError.message), { status: 500 });
      }

      guideTripReports = data ?? [];
    }

    const summary = buildAdminPostTripSummary({
      orders: orders ?? [],
      guideTripReports,
      now,
      categoryFilter,
    });

    return Response.json(
      successV2({
        ...summary,
        computedAt: now.toISOString(),
        since: since.toISOString(),
        categoryFilter: categoryFilter ?? null,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}

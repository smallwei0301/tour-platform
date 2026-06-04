/**
 * GET /api/v2/guide/trip-reports-due
 * Issue #1169/#1171: Guide dashboard — show overdue trip reports
 *
 * Returns the guide's past activities that need a trip report submission.
 * Joins guide_trip_reports.submitted_at so orders with a submitted report
 * are correctly excluded from the overdue list.
 * Read-only. Guide-session authenticated.
 */

import { NextRequest } from 'next/server';
import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { tripReportStatus } from '../../../../../src/lib/post-trip-eligibility.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: NextRequest) {
  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  // No Supabase in test/dev without env vars — return empty list
  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({ count: 0, tripReportsDue: [] }));
  }

  try {
    const supabase = await getSupabase();

    // Get guide's activities
    const { data: activities } = await supabase
      .from('activities')
      .select('id, title')
      .eq('guide_id', session.guideId);

    const activityIds = (activities || []).map((a: any) => a.id);
    const activityMap = Object.fromEntries(
      (activities || []).map((a: any) => [a.id, a])
    );

    if (activityIds.length === 0) {
      return Response.json(ok({ count: 0, tripReportsDue: [] }));
    }

    const now = new Date();

    // Query past confirmed/completed orders whose schedule has already ended.
    // Left-join guide_trip_reports so we can read submitted_at and show only
    // orders that haven't been reported yet (issue #1171).
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        activity_id,
        booking_id,
        schedule_id,
        status,
        activity_schedules!orders_schedule_id_fkey(end_at),
        guide_trip_reports(submitted_at)
      `)
      .in('activity_id', activityIds)
      .in('status', ['confirmed', 'completed', 'paid'])
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return Response.json(fail('SERVER_ERROR', error.message), { status: 500 });
    }

    const tripReportsDue: Array<{
      orderId: string;
      activityTitle: string;
      scheduleEndAt: string;
      tripReportStatus: 'overdue' | 'pending' | 'submitted';
    }> = [];

    for (const order of orders || []) {
      // Orders without a V2 booking_id cannot have trip reports — skip gracefully
      if (!order.booking_id) continue;

      const schedule = Array.isArray(order.activity_schedules)
        ? order.activity_schedules[0]
        : order.activity_schedules;

      if (!schedule?.end_at) continue;

      const scheduleEndAt = schedule.end_at as string;
      const endDate = new Date(scheduleEndAt);

      // Only consider activities that have already ended
      if (endDate >= now) continue;

      // Read submitted_at from joined guide_trip_reports rows
      const reportRows = Array.isArray(order.guide_trip_reports)
        ? order.guide_trip_reports
        : order.guide_trip_reports
          ? [order.guide_trip_reports]
          : [];
      const submittedRow = reportRows.find((r: any) => r?.submitted_at);
      const submittedAt = submittedRow?.submitted_at ?? null;

      const status = tripReportStatus({ scheduleEndAt, submittedAt, now });

      if (status === 'overdue') {
        tripReportsDue.push({
          orderId: order.id,
          activityTitle: activityMap[order.activity_id]?.title || '',
          scheduleEndAt,
          tripReportStatus: status,
        });
      }
    }

    return Response.json(ok({
      count: tripReportsDue.length,
      tripReportsDue,
    }));
  } catch (err) {
    console.error('trip-reports-due API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}

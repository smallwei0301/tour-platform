import { ok, fail } from '../../../../../src/lib/api';
import { getV2ActivityAvailability } from '../../../../../src/lib/availability-v2/activity-day-availability';

export const dynamic = 'force-dynamic';

type AvailabilitySchedule = {
  id: string | null;
  startAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
  planId: string | null;
};

function resolveCacheTierSeconds(schedules: AvailabilitySchedule[]): 15 | 30 | 60 {
  if (schedules.length === 0) return 60;

  const now = Date.now();
  let minDaysUntilStart = Number.POSITIVE_INFINITY;

  for (const s of schedules) {
    const ms = new Date(s.startAt).getTime();
    if (!Number.isFinite(ms)) continue;
    const days = (ms - now) / (1000 * 60 * 60 * 24);
    if (days < minDaysUntilStart) minDaysUntilStart = days;
  }

  if (minDaysUntilStart <= 3) return 15;
  if (minDaysUntilStart <= 14) return 30;
  return 60;
}

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function isV2AvailabilityMode(url: URL): boolean {
  const bookingV2 = process.env.BOOKING_V2;
  const flag = bookingV2 === '1' || bookingV2 === 'true';
  const query = url.searchParams.get('v2');
  return flag || query === '1' || query === 'true';
}

function normalizeParticipants(url: URL): number {
  const raw = url.searchParams.get('participants');
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slug) {
    return Response.json(fail('INVALID_SLUG', 'slug is required'), { status: 400 });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(fail('SUPABASE_DISABLED', 'availability requires supabase env'), { status: 503 });
  }

  try {
    const supabase = await getSupabaseAdmin();

    const { data: activityRow, error: activityError } = await supabase
      .from('activities')
      .select('id, slug')
      .eq('slug', slug)
      .maybeSingle();

    if (activityError) throw new Error(activityError.message);
    if (!activityRow?.id) {
      return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    }

    if (isV2AvailabilityMode(new URL(req.url))) {
      const requestUrl = new URL(req.url);
      const timezone = requestUrl.searchParams.get('timezone') || 'Asia/Taipei';
      const dateFrom = requestUrl.searchParams.get('dateFrom') || undefined;
      const dateTo = requestUrl.searchParams.get('dateTo') || undefined;
      const participants = normalizeParticipants(requestUrl);

      const v2 = await getV2ActivityAvailability(supabase, activityRow.id, {
        timezone,
        dateFrom,
        dateTo,
        participants,
      });

      const schedules: AvailabilitySchedule[] = v2.plans.map((row) => ({
        id: null,
        startAt: row.firstSlotStartAt ?? `${row.date}T00:00:00+08:00`,
        capacity: row.capacity,
        bookedCount: row.bookedCount,
        status: row.status,
        planId: row.planId,
      }));

      const sMaxAge = resolveCacheTierSeconds(schedules);
      return Response.json(ok({ schedules, timezone: v2.timezone, source: 'v2' }), {
        headers: {
          'cache-control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${Math.max(30, sMaxAge * 2)}`,
          'x-availability-cache-tier': String(sMaxAge),
          'x-availability-source': 'v2',
        },
      });
    }

    const { data: snapshotRows, error: snapshotError } = await supabase
      .from('activity_availability_daily')
      .select('date, plan_id, total_capacity, total_booked, remaining, is_open')
      .eq('activity_id', activityRow.id)
      .gte('date', new Date().toISOString().slice(0, 10))
      .order('date', { ascending: true });

    if (snapshotError) throw new Error(snapshotError.message);

    let schedules: AvailabilitySchedule[] = [];

    if (snapshotRows && snapshotRows.length > 0) {
      const hasPlanSpecificByDate = new Set(
        snapshotRows.filter((r: any) => r.plan_id).map((r: any) => String(r.date))
      );

      const normalized = snapshotRows.filter((r: any) => {
        if (!r.plan_id && hasPlanSpecificByDate.has(String(r.date))) return false;
        return true;
      });

      schedules = normalized.map((r: Record<string, unknown>): AvailabilitySchedule => ({
        id: null,
        startAt: `${r.date}T00:00:00+08:00`,
        capacity: Number(r.total_capacity ?? 0),
        bookedCount: Number(r.total_booked ?? 0),
        status: r.is_open ? 'open' : 'full',
        planId: (r.plan_id as string | null) ?? null,
      }));
    } else {
      const { data, error } = await supabase
        .from('activity_schedules')
        .select('id,start_at,end_at,capacity,booked_count,status,plan_id,min_participants,activities!inner(slug)')
        .eq('activities.slug', slug)
        .order('start_at', { ascending: true });

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        return Response.json(fail('NOT_FOUND', 'activity not found or no schedules'), { status: 404 });
      }

      schedules = data.map((s: any) => {
        const capacity = Number(s.capacity ?? 0);
        const bookedCount = Number(s.booked_count ?? 0);
        return {
          id: s.id,
          startAt: s.start_at,
          capacity,
          bookedCount,
          status: s.status || (bookedCount >= capacity ? 'full' : 'open'),
          planId: s.plan_id ?? null,
        };
      });
    }

    const sMaxAge = resolveCacheTierSeconds(schedules);

    return Response.json(ok({ schedules }), {
      headers: {
        'cache-control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${Math.max(30, sMaxAge * 2)}`,
        'x-availability-cache-tier': String(sMaxAge),
        'x-availability-source': 'legacy',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return Response.json(fail('LOAD_AVAILABILITY_FAILED', message), { status: 500 });
  }
}

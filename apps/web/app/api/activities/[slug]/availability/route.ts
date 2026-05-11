import { ok, fail } from '../../../../../src/lib/api';

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

  // 15s: very near-term inventory (0-3 days), 30s: short-term (4-14 days), 60s: longer horizon.
  if (minDaysUntilStart <= 3) return 15;
  if (minDaysUntilStart <= 14) return 30;
  return 60;
}

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
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

    // Prefer snapshot/aggregate table for frontend read path.
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
        // If plan-specific rows exist for a date, drop aggregate (plan_id null) row for that date.
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
      // Fallback to raw schedules if snapshot not ready.
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
        // Tiered cache window: 15/30/60 seconds by nearest upcoming departure.
        'cache-control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${Math.max(30, sMaxAge * 2)}`,
        'x-availability-cache-tier': String(sMaxAge),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return Response.json(fail('LOAD_AVAILABILITY_FAILED', message), { status: 500 });
  }
}

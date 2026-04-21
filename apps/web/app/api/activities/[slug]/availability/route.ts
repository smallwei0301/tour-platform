import { ok, fail } from '../../../../../src/lib/api';

export const dynamic = 'force-dynamic';

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

    let schedules = [] as any[];

    if (snapshotRows && snapshotRows.length > 0) {
      const hasPlanSpecificByDate = new Set(
        snapshotRows.filter((r: any) => r.plan_id).map((r: any) => String(r.date))
      );

      const normalized = snapshotRows.filter((r: any) => {
        // If plan-specific rows exist for a date, drop aggregate (plan_id null) row for that date.
        if (!r.plan_id && hasPlanSpecificByDate.has(String(r.date))) return false;
        return true;
      });

      schedules = normalized.map((r: any) => ({
        id: null,
        startAt: `${r.date}T00:00:00+08:00`,
        endAt: null,
        capacity: r.total_capacity,
        bookedCount: r.total_booked,
        status: r.is_open ? 'open' : 'full',
        planId: r.plan_id ?? null,
        minParticipants: 1,
        remaining: r.remaining,
        source: 'snapshot',
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

      schedules = data.map((s: any) => ({
        id: s.id,
        startAt: s.start_at,
        endAt: s.end_at,
        capacity: s.capacity,
        bookedCount: s.booked_count,
        status: s.status,
        planId: s.plan_id ?? null,
        minParticipants: s.min_participants ?? 1,
        source: 'schedule',
      }));
    }

    return Response.json(ok({ schedules, fetchedAt: new Date().toISOString() }), {
      headers: {
        // 短快取：平衡速度與即時性（最多約 5 秒延遲）
        'cache-control': 'public, s-maxage=5, stale-while-revalidate=10',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return Response.json(fail('LOAD_AVAILABILITY_FAILED', message), { status: 500 });
  }
}

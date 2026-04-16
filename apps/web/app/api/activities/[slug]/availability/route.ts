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

    // 瘦查詢：只撈名額需要欄位，且直接 inner join by slug（避免 getActivityBySlugDb 的大量資料組裝）
    const { data, error } = await supabase
      .from('activity_schedules')
      .select('id,start_at,end_at,capacity,booked_count,status,plan_id,min_participants,activities!inner(slug)')
      .eq('activities.slug', slug)
      .order('start_at', { ascending: true });

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      return Response.json(fail('NOT_FOUND', 'activity not found or no schedules'), { status: 404 });
    }

    const schedules = data.map((s: any) => ({
      id: s.id,
      startAt: s.start_at,
      endAt: s.end_at,
      capacity: s.capacity,
      bookedCount: s.booked_count,
      status: s.status,
      planId: s.plan_id ?? null,
      minParticipants: s.min_participants ?? 1,
    }));

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

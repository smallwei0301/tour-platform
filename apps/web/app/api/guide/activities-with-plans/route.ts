import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type ActivityRelation = {
  id: string;
  title: string | null;
  slug: string | null;
  is_active: boolean | null;
  guide_id: string;
};

function pickActivity(value: ActivityRelation | ActivityRelation[] | null): ActivityRelation | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok([]));
  }

  try {
    const supabase = await getSupabase();

    const { data, error } = await supabase
      .from('activity_plans')
      .select(`
        id,
        name,
        duration_minutes,
        price_type,
        base_price,
        status,
        booking_type,
        max_participants,
        activities!inner (
          id,
          title,
          slug,
          is_active,
          guide_id
        )
      `)
      .eq('activities.guide_id', session.guideId)
      .eq('activities.is_active', true)
      .in('status', ['active', 'published'])
      .order('created_at', { ascending: true });

    if (error) {
      return Response.json(fail('SERVER_ERROR', error.message), { status: 500 });
    }

    const rows = (data || [])
      .map((row: any) => {
        const activity = pickActivity(row.activities as ActivityRelation | ActivityRelation[] | null);
        if (!activity) return null;

        return {
          activityId: activity.id,
          activityTitle: activity.title || '',
          activitySlug: activity.slug || '',
          planId: row.id,
          planName: row.name || '',
          durationMinutes: row.duration_minutes,
          priceType: row.price_type || null,
          basePrice: row.base_price ?? null,
          status: row.status,
          bookingType: row.booking_type || null,
          maxParticipants: row.max_participants ?? null,
        };
      })
      .filter(Boolean);

    return Response.json(ok(rows));
  } catch (error: any) {
    return Response.json(fail('SERVER_ERROR', error?.message || 'server error'), { status: 500 });
  }
}

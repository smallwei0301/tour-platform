import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../src/config/supabase-service-env.mjs';
import {
  summarizeActivePlanSeasons,
  type PreviewActivityPlanSeason,
} from '../../../../src/lib/availability-v2/preview-canonical-reasons.ts';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
}

type ActivityRelation = {
  id: string;
  title: string | null;
  slug: string | null;
  status: string | null;
  guide_id: string;
};

function pickActivity(value: ActivityRelation | ActivityRelation[] | null): ActivityRelation | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!getSupabaseUrl()) {
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
        min_participants,
        max_participants,
        is_year_round,
        activity_plan_seasons (
          id,
          activity_plan_id,
          start_month,
          start_day,
          end_month,
          end_day,
          timezone,
          is_active
        ),
        activities!inner (
          id,
          title,
          slug,
          status,
          guide_id
        )
      `)
      .eq('activities.guide_id', session.guideId)
      .in('activities.status', ['active', 'published'])
      .in('status', ['active', 'published'])
      .order('created_at', { ascending: true });

    if (error) {
      return Response.json(fail('SERVER_ERROR', error.message), { status: 500 });
    }

    const rows = (data || [])
      .map((row: any) => {
        const activity = pickActivity(row.activities as ActivityRelation | ActivityRelation[] | null);
        if (!activity) return null;

        const activeSeasonSummaries = summarizeActivePlanSeasons(
          (row.activity_plan_seasons as PreviewActivityPlanSeason[] | null) || []
        );

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
          minParticipants: row.min_participants ?? null,
          maxParticipants: row.max_participants ?? null,
          isYearRound: Boolean(row.is_year_round),
          activeSeasonSummaries,
        };
      })
      .filter(Boolean);

    return Response.json(ok(rows));
  } catch (error: any) {
    return Response.json(fail('SERVER_ERROR', error?.message || 'server error'), { status: 500 });
  }
}

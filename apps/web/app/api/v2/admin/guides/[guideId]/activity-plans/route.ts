/**
 * Guide Activity Plans API (#1132)
 * GET - List a guide's activities with their active V2 plans
 *
 * Used by the availability rule form to populate the activity → plan cascading selector.
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../src/lib/api';
import { handleRouteError } from '../../../../../../../src/lib/route-error';
import { createClient } from '../../../../../../../src/lib/supabase/server';
import {
  summarizeActivePlanSeasons,
  type PreviewActivityPlanSeason,
} from '../../../../../../../src/lib/availability-v2/preview-canonical-reasons.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;

  if (!UUID_REGEX.test(guideId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid guideId'), { status: 422 });
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('activities')
      .select(`
        id,
        title,
        slug,
        activity_plans (
          id,
          name,
          status,
          booking_type,
          base_price,
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
          )
        )
      `)
      .eq('guide_id', guideId)
      .order('title', { ascending: true });

    if (error) {
      console.error('Error fetching guide activities with plans:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch activities'), { status: 500 });
    }

    // Only return activities that have at least one active plan
    const activities = (data || [])
      .map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        plans: ((a.activity_plans as Array<{
          id: string;
          name: string;
          status: string;
          booking_type: string;
          base_price: number;
          min_participants?: number | null;
          max_participants?: number | null;
          is_year_round?: boolean | null;
          activity_plan_seasons?: PreviewActivityPlanSeason[] | null;
        }>) || [])
          .filter((p) => p.status === 'active')
          .map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            booking_type: p.booking_type,
            base_price: p.base_price,
            minParticipants: p.min_participants ?? null,
            maxParticipants: p.max_participants ?? null,
            isYearRound: Boolean(p.is_year_round),
            activeSeasonSummaries: summarizeActivePlanSeasons(p.activity_plan_seasons || []),
          })),
      }))
      .filter((a) => a.plans.length > 0);

    return Response.json(successV2({ activities }));
  } catch (err) {
    return handleRouteError(err, { route: 'v2/admin/guides/guide/activity-plans' });
  }
}

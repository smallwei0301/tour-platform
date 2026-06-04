import type { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../../../../src/lib/api.ts';
import { getSupabase } from '../../../../../../../../../../src/lib/db.mjs';
import {
  ACTIVITY_PLAN_SEASON_SELECT_COLUMNS,
  isUuid,
  shapeActivityPlanSeason,
  validateUpdateActivityPlanSeasonPayload,
} from '../../../../../../../../../../src/lib/activity-plan-seasons.ts';

async function ensurePlanExists(activityId: string, planId: string) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('activity_plans')
    .select('id, activity_id')
    .eq('id', planId)
    .eq('activity_id', activityId)
    .single();

  if (error || !data) {
    return { supabase, exists: false as const };
  }

  return { supabase, exists: true as const };
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ activityId: string; planId: string; seasonId: string }> }
) {
  const { activityId, planId, seasonId } = await context.params;

  if (!isUuid(activityId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityId'), { status: 400 });
  }
  if (!isUuid(planId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid planId'), { status: 400 });
  }
  if (!isUuid(seasonId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid seasonId'), { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  try {
    const plan = await ensurePlanExists(activityId, planId);
    if (!plan.exists) {
      return Response.json(errorV2('NOT_FOUND', 'Plan not found'), { status: 404 });
    }

    const { data: existingSeason, error: existingSeasonError } = await plan.supabase
      .from('activity_plan_seasons')
      .select('start_month, start_day, end_month, end_day')
      .eq('id', seasonId)
      .eq('activity_plan_id', planId)
      .single();

    if ((existingSeasonError as { code?: string } | null)?.code === 'PGRST116' || !existingSeason) {
      return Response.json(errorV2('NOT_FOUND', 'Season not found'), { status: 404 });
    }
    if (existingSeasonError) {
      console.error('Error fetching activity plan season before update:', existingSeasonError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to load season'), { status: 500 });
    }

    const validation = validateUpdateActivityPlanSeasonPayload(body, existingSeason);
    if (!validation.ok) {
      return Response.json(errorV2('VALIDATION_ERROR', validation.message), { status: 400 });
    }

    const payload = {
      ...validation.value,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await plan.supabase
      .from('activity_plan_seasons')
      .update(payload)
      .eq('id', seasonId)
      .eq('activity_plan_id', planId)
      .select(ACTIVITY_PLAN_SEASON_SELECT_COLUMNS)
      .single();

    if ((error as { code?: string } | null)?.code === 'PGRST116' || !data) {
      return Response.json(errorV2('NOT_FOUND', 'Season not found'), { status: 404 });
    }
    if (error) {
      console.error('Error updating activity plan season:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to update season'), { status: 500 });
    }

    return Response.json(successV2({ season: shapeActivityPlanSeason(data) }));
  } catch (err) {
    console.error('Activity plan season PUT error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ activityId: string; planId: string; seasonId: string }> }
) {
  const { activityId, planId, seasonId } = await context.params;

  if (!isUuid(activityId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityId'), { status: 400 });
  }
  if (!isUuid(planId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid planId'), { status: 400 });
  }
  if (!isUuid(seasonId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid seasonId'), { status: 400 });
  }

  try {
    const plan = await ensurePlanExists(activityId, planId);
    if (!plan.exists) {
      return Response.json(errorV2('NOT_FOUND', 'Plan not found'), { status: 404 });
    }

    const { data, error } = await plan.supabase
      .from('activity_plan_seasons')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', seasonId)
      .eq('activity_plan_id', planId)
      .select(ACTIVITY_PLAN_SEASON_SELECT_COLUMNS)
      .single();

    if ((error as { code?: string } | null)?.code === 'PGRST116' || !data) {
      return Response.json(errorV2('NOT_FOUND', 'Season not found'), { status: 404 });
    }
    if (error) {
      console.error('Error disabling activity plan season:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to disable season'), { status: 500 });
    }

    return Response.json(successV2({ season: shapeActivityPlanSeason(data) }));
  } catch (err) {
    console.error('Activity plan season DELETE error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}

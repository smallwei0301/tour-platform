import type { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../../../src/lib/api.ts';
import { getSupabase } from '../../../../../../../../../src/lib/db.mjs';
import {
  ACTIVITY_PLAN_SEASON_SELECT_COLUMNS,
  isUuid,
  shapeActivityPlanSeason,
  sortActivityPlanSeasons,
  validateCreateActivityPlanSeasonPayload,
} from '../../../../../../../../../src/lib/activity-plan-seasons.ts';

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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ activityId: string; planId: string }> }
) {
  const { activityId, planId } = await context.params;

  if (!isUuid(activityId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityId'), { status: 400 });
  }
  if (!isUuid(planId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid planId'), { status: 400 });
  }

  try {
    const plan = await ensurePlanExists(activityId, planId);
    if (!plan.exists) {
      return Response.json(errorV2('NOT_FOUND', 'Plan not found'), { status: 404 });
    }

    const { data, error } = await plan.supabase
      .from('activity_plan_seasons')
      .select(ACTIVITY_PLAN_SEASON_SELECT_COLUMNS)
      .eq('activity_plan_id', planId)
      .order('start_month', { ascending: true })
      .order('start_day', { ascending: true })
      .order('end_month', { ascending: true })
      .order('end_day', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching activity plan seasons:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch seasons'), { status: 500 });
    }

    const seasons = sortActivityPlanSeasons((data || []).map(shapeActivityPlanSeason));
    return Response.json(successV2({ seasons }));
  } catch (err) {
    console.error('Activity plan seasons GET error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ activityId: string; planId: string }> }
) {
  const { activityId, planId } = await context.params;

  if (!isUuid(activityId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityId'), { status: 400 });
  }
  if (!isUuid(planId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid planId'), { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  const validation = validateCreateActivityPlanSeasonPayload(body);
  if (!validation.ok) {
    return Response.json(errorV2('VALIDATION_ERROR', validation.message), { status: 400 });
  }

  try {
    const plan = await ensurePlanExists(activityId, planId);
    if (!plan.exists) {
      return Response.json(errorV2('NOT_FOUND', 'Plan not found'), { status: 404 });
    }

    const { data, error } = await plan.supabase
      .from('activity_plan_seasons')
      .insert({
        activity_plan_id: planId,
        ...validation.value,
      })
      .select(ACTIVITY_PLAN_SEASON_SELECT_COLUMNS)
      .single();

    if (error || !data) {
      console.error('Error creating activity plan season:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to create season'), { status: 500 });
    }

    return Response.json(successV2({ season: shapeActivityPlanSeason(data) }), { status: 201 });
  } catch (err) {
    console.error('Activity plan seasons POST error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}

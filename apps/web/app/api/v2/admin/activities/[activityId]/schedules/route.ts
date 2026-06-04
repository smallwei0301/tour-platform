/**
 * POST /api/v2/admin/activities/:activityId/schedules
 *
 * V2 admin schedule create with strict V2 activity_plans validation
 * (Issue #1079 Section B).
 *
 * Auth/CSRF: enforced by middleware (admin_token cookie + double-submit CSRF).
 *
 * Strict planId rules — rejected before any insert:
 *   - planId provided but not active on this activity → 422 PLAN_NOT_ACTIVE
 *   - planId active but belongs to another activity   → 422 WRONG_ACTIVITY_PLAN
 *   - planId null/omitted + 0 or ≥2 active plans      → 422 AMBIGUOUS_PLAN
 *   - planId null/omitted + exactly 1 active plan     → auto-resolves
 *
 * Capacity is still validated by createScheduleDb via validateScheduleCapacityAgainstPlan.
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../src/lib/supabase/server';
import { createScheduleDb } from '../../../../../../../src/lib/db.mjs';
import { resolveAdminSchedulePlan } from '../../../../../../../src/lib/availability-v2/admin-schedule-plan-resolver.mjs';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ activityId: string }> },
) {
  const { activityId } = await context.params;
  if (!UUID_REGEX.test(activityId)) {
    return Response.json(
      errorV2('INVALID_ACTIVITY_ID', 'activityId 必須是 UUID 格式'),
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const rawPlanId = body.planId;
  const requestedPlanId =
    typeof rawPlanId === 'string' && rawPlanId.length > 0 ? rawPlanId : null;
  if (requestedPlanId !== null && !UUID_REGEX.test(requestedPlanId)) {
    return Response.json(
      errorV2('INVALID_PLAN_ID', 'planId 必須是 UUID 或留空'),
      { status: 400 },
    );
  }
  if (!body.startAt || typeof body.startAt !== 'string') {
    return Response.json(errorV2('VALIDATION_ERROR', 'startAt 必填'), { status: 400 });
  }
  if (!body.endAt || typeof body.endAt !== 'string') {
    return Response.json(errorV2('VALIDATION_ERROR', 'endAt 必填'), { status: 400 });
  }

  const supabase = await createClient();

  const { data: activePlans, error: plansError } = await supabase
    .from('activity_plans')
    .select('id, activity_id, status, max_participants, min_participants')
    .eq('activity_id', activityId)
    .eq('status', 'active');

  if (plansError) {
    return Response.json(
      errorV2('INTERNAL_ERROR', plansError.message || '讀取方案失敗'),
      { status: 500 },
    );
  }

  const resolved = resolveAdminSchedulePlan({
    requestedPlanId,
    activityId,
    activePlans: activePlans || [],
  });
  if (!resolved.ok) {
    return Response.json(
      errorV2(resolved.code as string, resolved.messageZh as string),
      { status: 422 },
    );
  }

  try {
    const schedule = await createScheduleDb({
      activityId,
      planId: resolved.planId,
      startAt: body.startAt,
      endAt: body.endAt,
      capacity: body.capacity,
      status: body.status,
      minParticipants: body.minParticipants,
      guideNote: body.guideNote,
    });
    return Response.json(successV2({ schedule }), { status: 201 });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    const messageZh = (err as { messageZh?: string })?.messageZh;
    const message = err instanceof Error ? err.message : '建立場次失敗';
    if (code === 'SCHEDULE_CAPACITY_EXCEEDS_PLAN') {
      return Response.json(
        errorV2('SCHEDULE_CAPACITY_EXCEEDS_PLAN', messageZh || message),
        { status: 422 },
      );
    }
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}

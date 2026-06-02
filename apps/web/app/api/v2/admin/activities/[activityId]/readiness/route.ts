/**
 * GET /api/v2/admin/activities/:activityId/readiness
 *
 * Issue #1164 — Admin/Plans: Show readiness gate warnings on activity plans page
 *
 * Read-only endpoint that calls validateActivityBookability and returns both
 * blockers AND warnings, plus a summary with plan/schedule counts.
 *
 * Auth/CSRF: enforced by middleware (admin_token cookie + double-submit CSRF).
 *
 * Response shape:
 * {
 *   success: true,
 *   data: {
 *     activityId: string,
 *     readinessOk: boolean,
 *     blockers: Blocker[],
 *     warnings: string[],
 *     summary: {
 *       activePlansCount: number,
 *       futureSchedulesCount: number,
 *       openSchedulesWithNullPlan: number,
 *     },
 *     computedAt: string (ISO timestamp),
 *   }
 * }
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../src/lib/supabase/server';
import { validateActivityBookability } from '../../../../../../../src/lib/booking-readiness/validate-activity-bookability.mjs';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ activityId: string }> },
) {
  const { activityId } = await context.params;

  if (!UUID_REGEX.test(activityId)) {
    return Response.json(
      errorV2('INVALID_ACTIVITY_ID', 'activityId 必須是 UUID 格式'),
      { status: 422 },
    );
  }

  const supabase = await createClient();

  // Run the readiness validation (read-only)
  const validation = await validateActivityBookability(activityId, { supabase });

  // Compute summary stats separately
  const now = new Date().toISOString();

  const { data: activePlans } = await supabase
    .from('activity_plans')
    .select('id')
    .eq('activity_id', activityId)
    .eq('status', 'active');

  const activePlansCount = (activePlans ?? []).length;

  const { data: futureSchedules } = await supabase
    .from('activity_schedules')
    .select('id')
    .eq('activity_id', activityId)
    .eq('status', 'open')
    .gt('start_at', now);

  const futureSchedulesCount = (futureSchedules ?? []).length;

  // openSchedulesWithNullPlan: open schedules with plan_id=null AND ≥2 active plans
  let openSchedulesWithNullPlan = 0;
  if (activePlansCount >= 2) {
    const { data: nullPlanSchedules } = await supabase
      .from('activity_schedules')
      .select('id')
      .eq('activity_id', activityId)
      .eq('status', 'open')
      .is('plan_id', null);

    openSchedulesWithNullPlan = (nullPlanSchedules ?? []).length;
  }

  return Response.json(
    successV2({
      activityId,
      readinessOk: validation.ok,
      blockers: validation.blockers,
      warnings: validation.warnings,
      summary: {
        activePlansCount,
        futureSchedulesCount,
        openSchedulesWithNullPlan,
      },
      computedAt: now,
    }),
    { status: 200 },
  );
}

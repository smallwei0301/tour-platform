/**
 * assertPlanBelongsToGuide (#1132)
 *
 * Validates that an activity_plan_id:
 *   1. Exists in the DB
 *   2. Has status = 'active'
 *   3. Belongs to the specified guide (via the parent activity)
 *
 * Returns { ok: true } on success, or { ok: false, code: ... } on failure.
 * The caller is responsible for returning an appropriate HTTP error response.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type PlanOwnershipResult =
  | { ok: true }
  | { ok: false; code: 'PLAN_NOT_FOUND' | 'PLAN_NOT_ACTIVE' | 'PLAN_WRONG_GUIDE' };

interface AssertPlanOpts {
  planId: string;
  guideId: string;
  supabase: SupabaseClient;
}

export async function assertPlanBelongsToGuide({
  planId,
  guideId,
  supabase,
}: AssertPlanOpts): Promise<PlanOwnershipResult> {
  const { data: plan, error } = await supabase
    .from('activity_plans')
    .select('id, status, activities(guide_id)')
    .eq('id', planId)
    .single();

  if (error || !plan) {
    return { ok: false, code: 'PLAN_NOT_FOUND' };
  }

  if (plan.status !== 'active') {
    return { ok: false, code: 'PLAN_NOT_ACTIVE' };
  }

  // activity_plans.activities is a FK join — Supabase returns object or array depending on cardinality
  const activity = Array.isArray(plan.activities) ? plan.activities[0] : plan.activities;
  if (!activity || activity.guide_id !== guideId) {
    return { ok: false, code: 'PLAN_WRONG_GUIDE' };
  }

  return { ok: true };
}

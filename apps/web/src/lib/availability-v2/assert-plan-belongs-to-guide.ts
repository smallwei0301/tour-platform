/**
 * assertPlanBelongsToGuide (#1132)
 *
 * Validates that an activity_plan_id:
 *   1. Exists in the DB
 *   2. Has status = 'active'
 *   3. Belongs to the specified guide (via the parent activity)
 *   4. Has a booking_type that accepts 動態可預約時段規則（即非 scheduled）。
 *      排程方案只看固定場次（activity_schedules），動態規則對它無效。
 *
 * Returns { ok: true } on success, or { ok: false, code: ... } on failure.
 * The caller is responsible for returning an appropriate HTTP error response.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isDynamicAvailabilityApplicable } from '../booking-type-flow.mjs';

export type PlanOwnershipResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'PLAN_NOT_FOUND'
        | 'PLAN_NOT_ACTIVE'
        | 'PLAN_WRONG_GUIDE'
        | 'RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE';
    };

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
    .select('id, status, booking_type, activities(guide_id)')
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

  // 排程方案只用固定場次，動態規則對它無效 → 對稱 #1495 硬擋。
  if (!isDynamicAvailabilityApplicable(plan.booking_type)) {
    return { ok: false, code: 'RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE' };
  }

  return { ok: true };
}

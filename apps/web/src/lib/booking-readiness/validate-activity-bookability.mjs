/**
 * Booking Readiness Validator
 *
 * Issue #881 — 發佈前新增 Booking readiness validation，阻擋未對齊方案/場次/容量公開
 *
 * Validates that an activity is ready to accept bookings before publishing.
 * Read-only: no writes, no side effects.
 */

/**
 * @typedef {Object} Blocker
 * @property {string} code - Machine-readable blocker code
 * @property {string} messageZh - Human-readable Traditional Chinese message
 * @property {string} activityId
 * @property {string|undefined} planId
 * @property {string|undefined} planSlug
 * @property {string|undefined} scheduleId
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} ok - true if no blockers
 * @property {Blocker[]} blockers - list of validation issues
 */

/**
 * Validate that an activity is bookable before publishing.
 *
 * @param {string} activityId
 * @param {{ supabase?: object }} [options]
 * @returns {Promise<ValidationResult>}
 */
export async function validateActivityBookability(activityId, options = {}) {
  let supabase = options.supabase;

  if (!supabase) {
    // Dynamically import the service-role client (avoids importing at module load time)
    const { getSupabase } = await import('../db.mjs');
    supabase = await getSupabase();
  }

  const blockers = [];

  // ── 1. Fetch activity ─────────────────────────────────────────────────────
  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('id,plans,status')
    .eq('id', activityId)
    .single();

  if (activityError || !activity) {
    return {
      ok: false,
      blockers: [{
        code: 'ACTIVITY_NOT_FOUND',
        messageZh: '找不到此行程',
        activityId,
      }],
    };
  }

  // ── 2. Fetch formal activity_plans ────────────────────────────────────────
  const { data: formalPlans, error: formalPlansError } = await supabase
    .from('activity_plans')
    .select('id,slug,name,status,max_participants,min_participants')
    .eq('activity_id', activityId);

  if (formalPlansError) {
    return {
      ok: false,
      blockers: [{
        code: 'ACTIVITY_NOT_FOUND',
        messageZh: '無法讀取行程方案資料',
        activityId,
      }],
    };
  }

  const activeFormalPlans = (formalPlans || []).filter(p => p.status === 'active');

  // ── 3. Must have at least one active formal plan ───────────────────────────
  if (activeFormalPlans.length === 0) {
    blockers.push({
      code: 'NO_ACTIVE_FORMAL_PLAN',
      messageZh: '尚未建立正式預約方案',
      activityId,
    });
  }

  // Build slug → plan map for quick lookup
  const activeFormalPlanBySlug = new Map(activeFormalPlans.map(p => [p.slug, p]));
  const activeFormalPlanById   = new Map(activeFormalPlans.map(p => [p.id, p]));

  // ── 4. Validate each public plan in activity.plans JSONB ──────────────────
  const publicPlans = Array.isArray(activity.plans) ? activity.plans : [];
  for (const publicPlan of publicPlans) {
    const pid  = publicPlan?.id;
    const slug = publicPlan?.slug || publicPlan?.id; // JSONB plans may use id as slug

    if (!pid) continue;

    // Try to resolve by slug first, then by id-as-slug
    const resolved = activeFormalPlanBySlug.get(slug) || activeFormalPlanBySlug.get(pid);

    if (!resolved) {
      // Check if there is an inactive formal plan with this slug/id
      const anyFormalPlan = (formalPlans || []).find(p => p.slug === slug || p.slug === pid);
      if (anyFormalPlan) {
        blockers.push({
          code: 'PLAN_NOT_ACTIVE',
          messageZh: `方案狀態不可預約（${anyFormalPlan.status}）：${slug || pid}`,
          activityId,
          planId: pid,
          planSlug: slug,
        });
      } else {
        blockers.push({
          code: 'PLAN_NOT_RESOLVABLE',
          messageZh: `公開方案無法對應正式預約方案：${pid}`,
          activityId,
          planId: pid,
          planSlug: slug,
        });
      }
    }
  }

  // ── 5. Fetch open schedules ───────────────────────────────────────────────
  const { data: schedules, error: schedulesError } = await supabase
    .from('activity_schedules')
    .select('id,start_at,plan_id,capacity,booked_count,status')
    .eq('activity_id', activityId);

  if (schedulesError) {
    // Non-fatal: skip schedule validation if table is unavailable
    return { ok: blockers.length === 0, blockers };
  }

  const openSchedules = (schedules || []).filter(s => s.status === 'open');

  for (const schedule of openSchedules) {
    const sid = schedule.id;

    if (schedule.plan_id == null) {
      // 5a. plan_id is null and there are 2+ active formal plans → ambiguous
      if (activeFormalPlans.length >= 2) {
        blockers.push({
          code: 'SCHEDULE_PLAN_AMBIGUOUS',
          messageZh: `場次未指定方案，且行程有多個可預約方案（scheduleId: ${sid}）`,
          activityId,
          scheduleId: sid,
        });
      }
      // If only 0 or 1 active formal plan, ambiguity is not an issue here
    } else {
      // 5b. plan_id is set — verify it matches an active formal plan
      const matchedPlan = activeFormalPlanById.get(schedule.plan_id);
      if (!matchedPlan) {
        blockers.push({
          code: 'SCHEDULE_PLAN_MISMATCH',
          messageZh: `場次指定方案不存在或已停用（scheduleId: ${sid}）`,
          activityId,
          scheduleId: sid,
        });
        continue; // Can't check capacity without a valid plan
      }

      // 5c. Check capacity <= plan.max_participants
      if (matchedPlan.max_participants != null && schedule.capacity > matchedPlan.max_participants) {
        blockers.push({
          code: 'SCHEDULE_CAPACITY_EXCEEDS_PLAN',
          messageZh: `場次人數上限（${schedule.capacity}）超過方案上限（${matchedPlan.max_participants}）：${sid}`,
          activityId,
          scheduleId: sid,
        });
      }
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
  };
}

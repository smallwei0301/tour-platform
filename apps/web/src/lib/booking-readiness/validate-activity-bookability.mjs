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
 * @property {string[]} warnings - list of non-blocking warning codes
 */

/**
 * Validate that an activity is bookable before publishing.
 *
 * @param {string} activityId
 * @param {{ supabase?: object, allPlansById?: object, now?: string }} [options]
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
  const warnings = [];

  // ── 1. Fetch activity ─────────────────────────────────────────────────────
  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('id,plans,status,guide_id')
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
      warnings,
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
      warnings,
    };
  }

  const activeFormalPlans = (formalPlans || []).filter(p => p.status === 'active');

  // ── 3. Must have at least one active formal plan ───────────────────────────
  if ((formalPlans || []).length === 0) {
    // Zero activity_plans rows — check if legacy JSONB plans exist
    const legacyPlans = activity.plans;
    if (Array.isArray(legacyPlans) && legacyPlans.length > 0) {
      // Activity is using legacy JSONB plans but has not migrated to activity_plans
      blockers.push({
        code: 'LEGACY_ONLY_PLANS',
        messageZh: '行程仍使用舊版 JSONB 方案，請先遷移至正式預約方案',
        activityId,
      });
    } else {
      blockers.push({
        code: 'NO_ACTIVE_FORMAL_PLAN',
        messageZh: '尚未建立正式預約方案',
        activityId,
      });
    }
    return { ok: false, blockers, warnings };
  } else if (activeFormalPlans.length === 0) {
    // Has activity_plans rows, but ALL are inactive/archived
    blockers.push({
      code: 'ALL_PLANS_INACTIVE',
      messageZh: '所有預約方案皆已停用或封存，請啟用至少一個方案',
      activityId,
    });
    return { ok: false, blockers, warnings };
  }

  if (!activity.guide_id) {
    blockers.push({
      code: 'MISSING_GUIDE_ASSIGNMENT',
      messageZh: '尚未指派導遊，請先指定導遊',
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
    return { ok: blockers.length === 0, blockers, warnings };
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
      } else if (activeFormalPlans.length === 1) {
        // Exactly 1 active plan — can be auto-resolved at booking time (non-blocking warning)
        if (!warnings.includes('SCHEDULE_PLAN_AUTORESOLVABLE')) {
          warnings.push('SCHEDULE_PLAN_AUTORESOLVABLE');
        }
      }
      // If 0 active formal plans, that case is already handled above (early return)
    } else {
      // 5b. plan_id is set — verify it matches an active formal plan
      const matchedPlan = activeFormalPlanById.get(schedule.plan_id);
      if (!matchedPlan) {
        // Check if this plan belongs to a different activity (cross-activity integrity violation)
        let isCrossActivity = false;
        if (options.allPlansById) {
          // Test mode: use injected global map
          const globalPlan = options.allPlansById[schedule.plan_id];
          if (globalPlan && globalPlan.activity_id !== activityId) {
            isCrossActivity = true;
          }
        } else {
          // Production: query Supabase for the plan's activity_id
          const { data: globalPlan } = await supabase
            .from('activity_plans')
            .select('id,activity_id')
            .eq('id', schedule.plan_id)
            .maybeSingle();
          if (globalPlan && globalPlan.activity_id !== activityId) {
            isCrossActivity = true;
          }
        }

        if (isCrossActivity) {
          blockers.push({
            code: 'SCHEDULE_PLAN_CROSS_ACTIVITY',
            messageZh: `場次指定方案屬於其他行程，資料完整性違規（scheduleId: ${sid}）`,
            activityId,
            scheduleId: sid,
          });
        } else {
          blockers.push({
            code: 'SCHEDULE_PLAN_MISMATCH',
            messageZh: `場次指定方案不存在或已停用（scheduleId: ${sid}）`,
            activityId,
            scheduleId: sid,
          });
        }
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

  // ── 6. NO_FUTURE_SCHEDULES — only fire when schedules EXIST but all are in the past ──
  // (When zero schedules exist, publish is not blocked — preserves backward compatibility)
  if ((schedules || []).length > 0) {
    const now = options.now ? new Date(options.now) : new Date();
    const hasFutureSchedule = openSchedules.some(s => {
      const planIsActive = !s.plan_id || activeFormalPlanById.get(s.plan_id);
      return planIsActive && new Date(s.start_at) > now;
    });
    if (!hasFutureSchedule) {
      blockers.push({
        code: 'NO_FUTURE_SCHEDULES',
        messageZh: '所有場次皆已過期，請新增未來日期的場次',
        activityId,
      });
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };
}

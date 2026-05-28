/**
 * Plan-schedule matching utilities for the activity detail page.
 *
 * Extracted from DatePlanSection.tsx so this pure logic can be unit-tested
 * directly with node --test without pulling in React or the Next.js runtime.
 */

export interface ScheduleLike {
  startAt?: string;
  start_at?: string;
  capacity: number;
  bookedCount?: number;
  booked_count?: number;
  status?: string;
  id?: string;
  planId?: string | null;
  plan_id?: string | null;
  minParticipants?: number;
  min_participants?: number;
}

export interface PlanScheduleResult {
  schedule: ScheduleLike | null;
  remaining: number;
  isFull: boolean;
  isOpen: boolean;
  isNotOpen: boolean;
}

function toDateKey(rawStartAt: string): string | null {
  const isoLikeMatch = rawStartAt.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoLikeMatch) return isoLikeMatch[1];
  const parsed = new Date(rawStartAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

/**
 * Returns availability info for a specific date + plan combination.
 *
 * @param schedules       Live or SSR schedule rows.
 * @param date            Target date string (YYYY-MM-DD).
 * @param planId          The plan ID to match (e.g. 'half-day' or a UUID).
 * @param knownPlanIds    Optional: the full set of plan IDs the UI knows about
 *                        (e.g. ['half-day','full-day']). When provided and no
 *                        schedule matches planId, the function checks whether
 *                        all schedule planIds are non-null and foreign to this
 *                        set (i.e. they come from a different ID space such as
 *                        V2 UUIDs). If so, it aggregates availability at the
 *                        date level — ignoring planId — to prevent open dates
 *                        from being incorrectly grayed out due to UUID↔slug ID
 *                        space mismatch. When knownPlanIds is empty (default),
 *                        the original strict-match behavior is preserved.
 */
export function getPlanScheduleForDate(
  schedules: ScheduleLike[],
  date: string | null,
  planId: string,
  knownPlanIds: string[] = [],
): PlanScheduleResult {
  if (!date) return { schedule: null, remaining: 0, isFull: false, isOpen: false, isNotOpen: false };

  let matchedSchedule: ScheduleLike | null = null;
  let totalRemaining = 0;
  let hasMatch = false;
  let hasOpen = false;
  let hasNotOpen = false;

  for (const s of schedules) {
    const startAt = s.startAt || s.start_at || '';
    const sPlanId = s.planId ?? s.plan_id ?? null;
    const dateKey = toDateKey(startAt);
    if (!dateKey) continue;
    // Match date + plan (planId=null means applicable to all plans)
    if (dateKey === date && (sPlanId === planId || sPlanId === null)) {
      hasMatch = true;
      if (!matchedSchedule) matchedSchedule = s;
      const capacity = Number(s.capacity || 0);
      const bookedCount = Number(s.bookedCount ?? s.booked_count ?? 0);
      const remaining = capacity - bookedCount;
      const status = s.status || (remaining <= 0 ? 'full' : 'open');
      totalRemaining += Math.max(0, remaining);
      if (status === 'open' && remaining > 0) hasOpen = true;
      if (status === 'not-open') hasNotOpen = true;
    }
  }

  if (hasMatch) {
    return {
      schedule: matchedSchedule,
      remaining: totalRemaining,
      isFull: !hasOpen && !hasNotOpen,
      isOpen: hasOpen,
      isNotOpen: !hasOpen && hasNotOpen,
    };
  }

  // No direct match. When knownPlanIds is provided, check whether all schedules
  // for this date use a completely foreign ID space (e.g. all V2 UUIDs). If so,
  // the mismatch is an ID-space divergence, not a genuine "no slot" condition —
  // fall back to date-level aggregation.
  if (knownPlanIds.length > 0) {
    const dateSchedules = schedules.filter((s) => {
      const startAt = s.startAt || s.start_at || '';
      const dk = toDateKey(startAt);
      return dk === date;
    });

    const allForeignIds =
      dateSchedules.length > 0 &&
      dateSchedules.every((s) => {
        const sPlanId = s.planId ?? s.plan_id ?? null;
        return sPlanId !== null && !knownPlanIds.includes(sPlanId);
      });

    if (allForeignIds) {
      let dayRemaining = 0;
      let dayOpen = false;
      let dayNotOpen = false;
      let firstSchedule: ScheduleLike | null = null;

      for (const s of dateSchedules) {
        if (!firstSchedule) firstSchedule = s;
        const capacity = Number(s.capacity || 0);
        const bookedCount = Number(s.bookedCount ?? s.booked_count ?? 0);
        const remaining = capacity - bookedCount;
        const status = s.status || (remaining <= 0 ? 'full' : 'open');
        dayRemaining += Math.max(0, remaining);
        if (status === 'open' && remaining > 0) dayOpen = true;
        if (status === 'not-open') dayNotOpen = true;
      }

      return {
        schedule: firstSchedule,
        remaining: dayRemaining,
        isFull: !dayOpen && !dayNotOpen,
        isOpen: dayOpen,
        isNotOpen: !dayOpen && dayNotOpen,
      };
    }
  }

  // No schedule for this date + plan → not open
  return { schedule: null, remaining: 0, isFull: false, isOpen: false, isNotOpen: true };
}

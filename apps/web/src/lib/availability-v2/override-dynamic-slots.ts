import {
  evaluateBookingAvailability,
  type EvaluatorSchedule,
} from './booking-availability-evaluator.ts';
import {
  CAPACITY_HOLD_BOOKING_STATUSES,
  calculateExistingParticipantsForGroup,
  getLocalDateInTimezone,
} from './group-booking-rule.ts';
import type { GuideSlotConflictOverride } from './conflict-override.ts';
import type { SerializedSlot } from '../slot-generator.ts';
import type { ScheduledListingBaseInput } from './scheduled-plan-slots.ts';

/**
 * Admin conflict-override on dynamic (instant / request) plans.
 *
 * 動態方案（booking_type instant/request）的可預約時段是由導遊規則動態產生，沒有
 * activity_schedules row。原本管理者在後台對「被既有預約擋住」的動態時段加開
 * 的 conflict override，旅客端動態路徑完全不吃 —— 因為 evaluator 的 override
 * 判定只在 selectedSchedule 分支內。
 *
 * 本 helper 把每個 active override「視為一個 synthetic 固定場次」（容量取方案
 * max_participants、booked_count 取同方案既有佔位人數），並以 rules=[] 丟進共用
 * 的 evaluateBookingAvailability，讓既有且已測試的 `allowed_with_admin_override`
 * 判定生效。只收集真正被例外開放（canonicalState='allowed_with_admin_override'）
 * 的 slot，回傳給 available-slots 併入動態結果、或供 draft 驗證單一時段。
 *
 * 設計重點：rules=[] → 關閉「場次須出現在規則格線」的檢查（該時段正是因既有預約
 * 被擋掉、不在規則產生的可用清單中）。blackout／季節／容量仍由 evaluator 把關，
 * override 只繞過 BOOKING_CONFLICT（與 selectedSchedule 路徑一致）。
 */

function overrideMatchesPlan(
  override: GuideSlotConflictOverride,
  activityId: string,
  planId: string,
): boolean {
  return (
    override.status === 'active' &&
    override.activity_id === activityId &&
    override.activity_plan_id === planId
  );
}

function overrideStartInRange(
  override: GuideSlotConflictOverride,
  dateFrom: string,
  dateTo: string,
  timezone: string,
): boolean {
  const localDate = getLocalDateInTimezone(override.start_at, timezone);
  return localDate >= dateFrom && localDate <= dateTo;
}

export function evaluateOverrideDynamicSlots(
  baseInput: ScheduledListingBaseInput,
  overrides: GuideSlotConflictOverride[] | undefined,
): SerializedSlot[] {
  if (!overrides || overrides.length === 0) return [];

  const collected: SerializedSlot[] = [];

  for (const override of overrides) {
    if (!overrideMatchesPlan(override, baseInput.activityId, baseInput.planId)) continue;
    if (!overrideStartInRange(override, baseInput.dateFrom, baseInput.dateTo, baseInput.timezone)) {
      continue;
    }

    const localDate = getLocalDateInTimezone(override.start_at, baseInput.timezone);
    const existingParticipants = calculateExistingParticipantsForGroup({
      bookings: baseInput.bookings,
      activityId: baseInput.activityId,
      planId: baseInput.planId,
      localDate,
      timezone: baseInput.timezone,
      statuses: CAPACITY_HOLD_BOOKING_STATUSES,
    });

    const syntheticSchedule: EvaluatorSchedule = {
      id: override.id,
      activity_id: baseInput.activityId,
      plan_id: baseInput.planId,
      start_at: override.start_at,
      end_at: override.end_at,
      capacity: baseInput.plan.max_participants,
      booked_count: existingParticipants,
      status: 'open',
    };

    const evaluation = evaluateBookingAvailability({
      ...baseInput,
      rules: [],
      selectedSchedule: syntheticSchedule,
      selectedScheduleAuthority: 'authoritative',
      conflictOverrides: [override],
    });

    for (const slot of evaluation.slots) {
      // Only surface slots the override genuinely re-opened. Slots that are
      // simply available (no conflict) are already produced by the dynamic
      // path; outside-season / blackout / capacity failures yield no slot.
      if (slot.isAvailable && slot.canonicalState === 'allowed_with_admin_override') {
        // scheduleId is null: this is a dynamic (rule-based) slot re-opened by an
        // override, NOT a real activity_schedules row. Draft matches it by startAt
        // + the active override, so it must not carry a synthetic schedule id.
        collected.push({ ...slot, scheduleId: null });
      }
    }
  }

  collected.sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  return collected;
}

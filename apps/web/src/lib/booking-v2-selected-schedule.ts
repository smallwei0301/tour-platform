import { getDateStringInTimezone } from './slot-generator.ts';

export type DraftScheduleRow = {
  id: string;
  activity_id: string;
  plan_id: string | null;
  start_at: string;
  status: string;
  capacity: number;
  booked_count: number;
};

export function validateDraftSlotAgainstSelectedSchedule(payload: {
  schedule: DraftScheduleRow | null;
  activityId: string;
  resolvedPlanId: string;
  requestStartAt: string;
  slotDate: string;
  timezone: string;
  participants: number;
}): { available: boolean; reason?: string } {
  const { schedule, activityId, resolvedPlanId, requestStartAt, slotDate, timezone, participants } = payload;

  if (!schedule) return { available: false, reason: 'SCHEDULE_NOT_FOUND' };
  if (schedule.activity_id !== activityId) return { available: false, reason: 'SCHEDULE_ACTIVITY_MISMATCH' };

  const planMatches = !schedule.plan_id || schedule.plan_id === resolvedPlanId;
  if (!planMatches) return { available: false, reason: 'SCHEDULE_PLAN_MISMATCH' };

  const scheduleLocalDate = getDateStringInTimezone(new Date(schedule.start_at), timezone);
  if (scheduleLocalDate !== slotDate) return { available: false, reason: 'SCHEDULE_DATE_MISMATCH' };

  const selectedStartAt = new Date(schedule.start_at).getTime();
  const requestStart = new Date(requestStartAt).getTime();
  if (Number.isNaN(selectedStartAt) || Number.isNaN(requestStart) || selectedStartAt !== requestStart) {
    return { available: false, reason: 'SCHEDULE_START_MISMATCH' };
  }

  if (schedule.status !== 'open') return { available: false, reason: 'SCHEDULE_NOT_OPEN' };

  const remaining = Math.max(0, Number(schedule.capacity ?? 0) - Number(schedule.booked_count ?? 0));
  if (remaining < participants) return { available: false, reason: 'SCHEDULE_CAPACITY_EXCEEDED' };

  return { available: true };
}

const AUTHORITATIVE_SELECTED_SCHEDULE_REJECT_REASONS = new Set([
  'SCHEDULE_NOT_OPEN',
  'SCHEDULE_CAPACITY_EXCEEDED',
]);

export function shouldRejectDraftWhenSelectedScheduleInvalid(payload: {
  hasScheduleId: boolean;
  selectedScheduleValidation: { available: boolean; reason?: string } | null;
}): boolean {
  const { hasScheduleId, selectedScheduleValidation } = payload;
  if (!hasScheduleId) return false;
  if (!selectedScheduleValidation) return false;
  if (selectedScheduleValidation.available === true) return false;
  return AUTHORITATIVE_SELECTED_SCHEDULE_REJECT_REASONS.has(selectedScheduleValidation.reason ?? '');
}

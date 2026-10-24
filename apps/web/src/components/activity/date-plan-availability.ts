import { selectUpcomingSchedules } from '../../lib/activity/upcoming-schedules.mjs';
import { getPlanScheduleForDate, type ScheduleLike } from './plan-schedule-match.ts';

/** Resolve the dates and booking identity shown for the current plan. */
export function resolveDatePlanAvailability({ schedules, liveSchedules, date, planId, knownPlanIds = [], now = Date.now() }: {
  schedules: ScheduleLike[];
  liveSchedules: ScheduleLike[] | null;
  date: string | null;
  planId: string | null;
  knownPlanIds?: string[];
  now?: number;
}) {
  const effectiveSchedules: ScheduleLike[] = selectUpcomingSchedules(liveSchedules ?? schedules, now);
  // Determine plan scope before capacity filtering changes the ID-space evidence.
  const planAvailability = planId ? getPlanScheduleForDate(effectiveSchedules, date, planId, knownPlanIds) : null;
  const bookableSchedules = effectiveSchedules.filter((schedule) => {
    const remaining = Number(schedule.capacity) - Number(schedule.bookedCount ?? schedule.booked_count ?? 0);
    return (schedule.status || 'open') === 'open' && remaining > 0;
  });
  const availability = planId && planAvailability?.isOpen
    ? getPlanScheduleForDate(bookableSchedules, date, planId, knownPlanIds) : null;
  return { effectiveSchedules, selectedDate: availability?.isOpen ? date : null, scheduleId: availability?.isOpen ? availability.schedule?.id : undefined };
}

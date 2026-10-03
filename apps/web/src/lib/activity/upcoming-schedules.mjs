/**
 * Keep schedules that have not started, using absolute ISO instants rather than
 * a display timezone. Status/capacity remain the caller's booking policy.
 * @param {Array<any>} schedules
 * @param {number} now Epoch milliseconds; injectable for deterministic callers.
 * @returns {Array<any>}
 */
export function selectUpcomingSchedules(schedules, now = Date.now()) {
  return schedules.filter((schedule) => {
    const entry = /** @type {{ startAt?: unknown, start_at?: unknown } | null} */ (schedule);
    const start = entry?.startAt || entry?.start_at;
    // An explicit offset is required: timezone-less dates are not absolute instants.
    if (typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(start)) return false;
    const calendarDay = new Date(`${start.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== start.slice(0, 10)) return false;
    const startTime = Date.parse(start);
    return Number.isFinite(startTime) && startTime > now;
  });
}

function toDateKey(rawStartAt) {
  const raw = String(rawStartAt || '');
  if (!raw) return null;

  const isoLikeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoLikeMatch) return isoLikeMatch[1];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function matchesPlan(schedule, planId) {
  if (!planId) return true;
  const schedulePlanId = schedule.planId ?? schedule.plan_id ?? null;
  return schedulePlanId === null || schedulePlanId === planId;
}

export function resolveInitialCheckoutSelection({ schedules, urlScheduleId = '', urlDate = '', planId = '' }) {
  const allSchedules = Array.isArray(schedules) ? schedules : [];
  const openSchedules = allSchedules.filter((s) => s?.status === 'open');

  if (urlScheduleId) {
    const exact = openSchedules.find((s) => s.id === urlScheduleId);
    if (exact) return { selectedScheduleId: exact.id, validationError: null };
    return {
      selectedScheduleId: '',
      validationError: '你選擇的日期目前沒有此方案可預約，請重新選擇。',
    };
  }

  if (urlDate) {
    const dateMatched = openSchedules.find((s) => {
      const startAt = s.startAt || s.start_at;
      return toDateKey(startAt) === urlDate && matchesPlan(s, planId);
    });

    if (dateMatched) {
      return { selectedScheduleId: dateMatched.id, validationError: null };
    }

    return {
      selectedScheduleId: '',
      validationError: '你選擇的日期目前沒有此方案可預約，請重新選擇。',
    };
  }

  const fallback = openSchedules.find((s) => matchesPlan(s, planId)) || openSchedules[0];
  return { selectedScheduleId: fallback?.id || '', validationError: null };
}

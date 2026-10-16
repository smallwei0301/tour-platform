import test from 'node:test';
import assert from 'node:assert/strict';
import { getV2ActivityAvailability } from '../../src/lib/availability-v2/activity-day-availability.ts';

function database() {
  const data = {
    activities: { id: 'activity', guide_id: 'guide' },
    activity_plans: [{ id: 'plan', activity_id: 'activity', duration_minutes: 60, max_participants: 8, booking_type: 'scheduled' }],
    guide_availability_rules: [{ id: 'rule', guide_id: 'guide', activity_plan_id: 'plan', weekday: 4, start_time_local: '09:00', end_time_local: '12:00', timezone: 'Asia/Taipei', slot_interval_minutes: 60, buffer_before_minutes: 0, buffer_after_minutes: 0, effective_from: '2026-10-01', effective_to: '2026-10-01', is_active: true }],
    guide_blackout_dates: [], bookings: [],
  };
  return { from(table) { const q = { select() { return q; }, eq() { return q; }, in() { return q; }, maybeSingle() { return Promise.resolve({ data: data[table] }); }, then(resolve) { return Promise.resolve({ data: data[table] }).then(resolve); } }; return q; } };
}
test('V2 day excludes past and exactly started slots from count, first start and capacity summary', async () => {
  const result = await getV2ActivityAvailability(database(), 'activity', { dateFrom: '2026-10-01', dateTo: '2026-10-01', timezone: 'Asia/Taipei', now: new Date('2026-10-01T02:00:00Z') });
  assert.deepEqual(result.plans, [{ date: '2026-10-01', planId: 'plan', status: 'open', remaining: 8, bookedCount: 0, capacity: 8, firstSlotStartAt: '2026-10-01T11:00:00+08:00', slotCount: 1, timezone: 'Asia/Taipei' }]);
});
test('V2 day with its final slot exactly started has no bookable date', async () => {
  const result = await getV2ActivityAvailability(database(), 'activity', { dateFrom: '2026-10-01', dateTo: '2026-10-01', timezone: 'Asia/Taipei', now: new Date('2026-10-01T11:00:00+08:00') });
  assert.deepEqual(result.plans, [{ date: '2026-10-01', planId: 'plan', status: 'not-open', remaining: 0, bookedCount: 8, capacity: 8, firstSlotStartAt: null, slotCount: 0, timezone: 'Asia/Taipei' }]);
});
test('V2 cutoff uses absolute instant when output timezone differs from rule timezone', async () => {
  const result = await getV2ActivityAvailability(database(), 'activity', { dateFrom: '2026-10-01', dateTo: '2026-10-01', timezone: 'UTC', now: new Date('2026-09-30T19:00:00-07:00') });
  assert.equal(result.plans[0].firstSlotStartAt, '2026-10-01T03:00:00+00:00');
  assert.equal(result.plans[0].slotCount, 1);
});

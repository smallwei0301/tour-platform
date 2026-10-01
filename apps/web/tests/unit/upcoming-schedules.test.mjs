import test from 'node:test';
import assert from 'node:assert/strict';
import { selectUpcomingSchedules } from '../../src/lib/upcoming-schedules.mjs';
import { inferPlanIdForBookingUrl, resolveBookingEntryHref, resolvePlanBookingHref } from '../../src/lib/booking-entry.mjs';

const now = Date.parse('2026-10-01T04:00:00Z');
const oldId = '8ade1221-95b6-47e9-92a0-b7c935743d51';

// Mock the detail page's existing CTA composition with the real URL helpers.
function detailView(schedules, clock = now, plans = []) {
  const displayedSchedules = selectUpcomingSchedules(schedules, clock);
  const selected = displayedSchedules.find((s) => {
    const status = String(s?.status || '').toLowerCase();
    const capacity = Number(s?.capacity ?? 0);
    const bookedCount = Number(s?.bookedCount ?? s?.booked_count ?? 0);
    return status !== 'full' && status !== 'closed' && (capacity > 0 ? bookedCount < capacity : true);
  });
  const scheduleId = selected?.scheduleId ?? selected?.schedule_id ?? selected?.id;
  const href = selected ? resolvePlanBookingHref({
    activitySlug: 'island-walk',
    planId: inferPlanIdForBookingUrl({
      explicitPlanId: selected.planId ?? selected.plan_id,
      scheduleId, schedules: displayedSchedules, plans,
    }) || undefined,
    date: String(selected.startAt || selected.start_at || '').slice(0, 10) || undefined,
    scheduleId,
  }) : resolveBookingEntryHref({ activitySlug: 'island-walk' });
  return { displayedSchedules, selected, href };
}

test('expired open UUID and already-started sessions cannot become direct CTA candidates', () => {
  const expired = { id: oldId, status: 'open', startAt: '2026-09-30T04:00:00Z' };
  const ongoing = { id: 'ongoing', status: 'open', startAt: '2026-10-01T03:59:59Z', endAt: '2026-10-01T05:00:00Z' };
  const future = { id: 'future', status: 'open', startAt: '2026-10-02T12:00:00+08:00', planId: 'plan-a' };
  const view = detailView([expired, ongoing, future]);
  assert.deepEqual(view.displayedSchedules, [future]);
  assert.equal(view.selected, future);
  assert.equal(view.href, '/booking/island-walk?plan=plan-a&date=2026-10-02&scheduleId=future');
  assert.ok(!view.href.includes(oldId));
});

test('start equals now is included across offsets; one millisecond earlier is excluded', () => {
  const utc = { startAt: '2026-10-01T04:00:00Z' };
  const taipei = { startAt: '2026-10-01T12:00:00+08:00' };
  const negative = { startAt: '2026-09-30T23:00:00-05:00' };
  const past = { startAt: '2026-10-01T11:59:59.999+08:00' };
  assert.deepEqual(selectUpcomingSchedules([past, utc, taipei, negative], now), [utc, taipei, negative]);
});

test('future full, closed and capacity-filled sessions display but the available session supplies CTA', () => {
  const at = '2026-10-02T04:00:00Z';
  const full = { id: 'full', startAt: at, status: 'FULL' };
  const closed = { id: 'closed', startAt: at, status: 'closed' };
  const filled = { id: 'filled', startAt: at, status: 'open', capacity: 2, booked_count: 2 };
  const available = { id: 'available', startAt: at, status: 'open', capacity: 2, bookedCount: 1 };
  const view = detailView([full, closed, filled, available]);
  assert.deepEqual(view.displayedSchedules, [full, closed, filled, available]);
  assert.equal(view.selected, available);
  assert.equal(new URL(view.href, 'https://mock.invalid').searchParams.get('scheduleId'), 'available');
  assert.equal(detailView([full, closed, filled]).href, '/booking/island-walk');
});

test('all expired sessions leave an empty list and generic booking entry', () => {
  const view = detailView([{ id: oldId, startAt: '2026-09-30T12:00:00+08:00', status: 'open' }]);
  assert.deepEqual(view.displayedSchedules, []);
  assert.equal(view.selected, undefined);
  assert.equal(view.href, '/booking/island-walk');
});

test('invalid, missing and timezone-less dates cannot enter the list or CTA', () => {
  const schedules = [{}, null, { startAt: '' }, { startAt: 'invalid' }, { startAt: '2027-02-30T04:00:00Z' }, { startAt: '2026-10-02T24:00:00Z' }, { startAt: '2026-99-01T04:00:00Z' }, { startAt: '2026-10-02' }, { startAt: '2026-10-02T04:00:00' }];
  assert.deepEqual(selectUpcomingSchedules(schedules, now), []);
  assert.equal(detailView(schedules).href, '/booking/island-walk');
});

test('snake aliases, original order/objects and injected clock are preserved without mutation', () => {
  const later = Object.freeze({ schedule_id: 'snake', plan_id: 'snake-plan', start_at: '2026-10-03T04:00:00Z', status: 'open' });
  const earlier = Object.freeze({ id: 'earlier', startAt: '2026-10-02T04:00:00Z' });
  const input = Object.freeze([later, earlier]);
  const view = detailView(input);
  assert.deepEqual(view.displayedSchedules, [later, earlier]);
  assert.notEqual(view.displayedSchedules, input);
  assert.equal(view.displayedSchedules[0], later);
  assert.equal(view.displayedSchedules[1], earlier);
  assert.equal(view.href, '/booking/island-walk?plan=snake-plan&date=2026-10-03&scheduleId=snake');
  assert.deepEqual(selectUpcomingSchedules(input, Date.parse('2026-10-03T04:00:00.001Z')), []);
  assert.deepEqual(input, [later, earlier]);
});

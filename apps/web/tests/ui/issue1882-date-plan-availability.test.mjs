import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDatePlanAvailability } from '../../src/components/activity/date-plan-availability.ts';
const now = Date.parse('2026-04-07T04:00:00Z');
const row = (id, overrides = {}) => ({ id, startAt: '2026-04-10T01:00:00Z', capacity: 8, bookedCount: 0, status: 'open', planId: 'a', ...overrides });
const ssr = [row('ssr')];
function resolve(liveSchedules, overrides = {}) { return resolveDatePlanAvailability({ schedules: ssr, liveSchedules, date: '2026-04-10', planId: 'a', knownPlanIds: ['a', 'b'], now, ...overrides }); }
test('successful empty live result clears SSR dates and selected booking identity', () => {
  assert.deepEqual(resolve([]), { effectiveSchedules: [], selectedDate: null, scheduleId: undefined });
});
test('refresh resolves the selected date to an open capacity-bearing same-plan slot, not stale/full/other-plan ids', () => {
  const live = [row('full', { bookedCount: 8 }), row('other', { planId: 'b' }), row('closed', { status: 'closed' }), row('replacement')];
  assert.deepEqual(resolve(live), { effectiveSchedules: live, selectedDate: '2026-04-10', scheduleId: 'replacement' });
  for (const rows of [[], [row('other', { planId: 'b' })], [row('full', { bookedCount: 8 })], [row('closed', { status: 'closed' })]]) {
    assert.equal(resolve(rows).selectedDate, null);
    assert.equal(resolve(rows).scheduleId, undefined);
  }
});
test('render cutoff excludes past and exactly-now SSR/live sessions and clears their date/id', () => {
  const expired = row('past', { startAt: '2026-04-07T03:59:59Z' });
  const started = row('now', { startAt: '2026-04-07T12:00:00+08:00' });
  const future = row('future', { startAt: '2026-04-07T04:00:00.001Z' });
  assert.deepEqual(resolve([expired, started, future], { date: '2026-04-07' }), { effectiveSchedules: [future], selectedDate: '2026-04-07', scheduleId: 'future' });
  assert.deepEqual(resolve(null, { schedules: [expired, started], date: '2026-04-07' }), { effectiveSchedules: [], selectedDate: null, scheduleId: undefined });
});
test('capacity filtering cannot turn a known full plan into a foreign-plan booking fallback', () => {
  const live = [row('known-full', { bookedCount: 8 }), row('foreign-open', { planId: 'foreign' })];
  assert.deepEqual(resolve(live), { effectiveSchedules: live, selectedDate: null, scheduleId: undefined });
});

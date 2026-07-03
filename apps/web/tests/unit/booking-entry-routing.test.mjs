import test from 'node:test';
import assert from 'node:assert/strict';
import { inferPlanIdForBookingUrl, resolveBookingEntryHref, resolvePlanBookingHref } from '../../src/lib/booking-entry.mjs';

// Legacy 退役階段二（#1406）：移除 legacy `/checkout` 入口。
// booking entry 一律導向 Booking V2 `/booking/[slug]`，`useBookingV2` 參數（含 false）不再產生 legacy 連結。
test('resolveBookingEntryHref always routes to V2 booking page (flag off no longer reaches legacy /checkout)', () => {
  assert.equal(resolveBookingEntryHref({ activitySlug: 'kaohsiung-cave', useBookingV2: false }), '/booking/kaohsiung-cave');
  assert.equal(resolveBookingEntryHref({ activitySlug: 'kaohsiung-cave', useBookingV2: true }), '/booking/kaohsiung-cave');
});

test('resolvePlanBookingHref carries plan params to V2 booking page regardless of flag (no legacy /checkout)', () => {
  const v2Href = resolvePlanBookingHref({
    activitySlug: 'kaohsiung-cave',
    planId: 'half-day',
    date: '2026-05-01',
    scheduleId: 'sch_1',
    useBookingV2: true,
  });
  assert.equal(v2Href, '/booking/kaohsiung-cave?plan=half-day&date=2026-05-01&scheduleId=sch_1');

  // flag off 亦導向 V2（階段二退役後不再回退 legacy /checkout）
  const flagOffHref = resolvePlanBookingHref({
    activitySlug: 'kaohsiung-cave',
    planId: 'half-day',
    date: '2026-05-01',
    scheduleId: 'sch_1',
    useBookingV2: false,
  });
  assert.equal(flagOffHref, '/booking/kaohsiung-cave?plan=half-day&date=2026-05-01&scheduleId=sch_1');
});

test('inferPlanIdForBookingUrl returns explicit plan first', () => {
  const planId = inferPlanIdForBookingUrl({
    explicitPlanId: ' plan_explicit ',
    scheduleId: 'sch_1',
    schedules: [{ id: 'sch_1', plan_id: 'plan_from_schedule' }],
    plans: [{ id: 'plan_from_plans', status: 'active' }],
  });
  assert.equal(planId, 'plan_explicit');
});

test('inferPlanIdForBookingUrl resolves schedule-linked plan when explicit plan is missing', () => {
  const planId = inferPlanIdForBookingUrl({
    explicitPlanId: '',
    scheduleId: 'sch_1',
    schedules: [{ id: 'sch_1', plan_id: 'plan_schedule' }],
    plans: [{ id: 'plan_other', status: 'active' }],
  });
  assert.equal(planId, 'plan_schedule');
});

test('inferPlanIdForBookingUrl uses single active or candidate plan when safe', () => {
  const planId = inferPlanIdForBookingUrl({
    explicitPlanId: '',
    scheduleId: '',
    schedules: [],
    plans: [
      { id: 'plan_archived', status: 'archived' },
      { id: 'plan_active', status: 'active' },
    ],
  });
  assert.equal(planId, 'plan_active');
});

test('inferPlanIdForBookingUrl rejects ambiguous active/candidate plans', () => {
  const planId = inferPlanIdForBookingUrl({
    explicitPlanId: '',
    scheduleId: '',
    schedules: [],
    plans: [
      { id: 'plan_a', status: 'active' },
      { id: 'plan_b', status: 'candidate' },
    ],
  });
  assert.equal(planId, '');
});

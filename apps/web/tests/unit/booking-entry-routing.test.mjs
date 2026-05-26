import test from 'node:test';
import assert from 'node:assert/strict';
import { inferPlanIdForBookingUrl, resolveBookingEntryHref, resolvePlanBookingHref } from '../../src/lib/booking-entry.mjs';

test('resolveBookingEntryHref keeps legacy checkout when flag is off', () => {
  const href = resolveBookingEntryHref({ activitySlug: 'kaohsiung-cave', useBookingV2: false });
  assert.equal(href, '/checkout?slug=kaohsiung-cave');
});

test('resolveBookingEntryHref routes to booking page when flag is on', () => {
  const href = resolveBookingEntryHref({ activitySlug: 'kaohsiung-cave', useBookingV2: true });
  assert.equal(href, '/booking/kaohsiung-cave');
});

test('resolvePlanBookingHref carries v2 params only when flag is on', () => {
  const v2Href = resolvePlanBookingHref({
    activitySlug: 'kaohsiung-cave',
    planId: 'half-day',
    date: '2026-05-01',
    scheduleId: 'sch_1',
    useBookingV2: true,
  });
  assert.equal(v2Href, '/booking/kaohsiung-cave?plan=half-day&date=2026-05-01&scheduleId=sch_1');

  const legacyHref = resolvePlanBookingHref({
    activitySlug: 'kaohsiung-cave',
    planId: 'half-day',
    date: '2026-05-01',
    scheduleId: 'sch_1',
    useBookingV2: false,
  });
  assert.equal(legacyHref, '/checkout?slug=kaohsiung-cave&plan=half-day&date=2026-05-01&scheduleId=sch_1');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBookingEntryHref, resolvePlanBookingHref } from '../../src/lib/booking-entry.mjs';

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

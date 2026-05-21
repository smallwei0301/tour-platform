import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePlanBookingHref } from '../../src/lib/booking-entry.mjs';
import { resolveInitialCheckoutSelection } from '../../src/lib/checkout-selection.mjs';

test('resolvePlanBookingHref preserves selected date for legacy checkout flow', () => {
  const href = resolvePlanBookingHref({
    activitySlug: 'activity-1775040922554',
    planId: 'half-day-morning',
    date: '2026-05-24',
    useBookingV2: false,
  });

  assert.equal(
    href,
    '/checkout?slug=activity-1775040922554&plan=half-day-morning&date=2026-05-24'
  );
});

test('resolveInitialCheckoutSelection selects matching open schedule by date + plan', () => {
  const result = resolveInitialCheckoutSelection({
    schedules: [
      { id: 's-1', startAt: '2026-05-11T09:00:00+08:00', status: 'open', capacity: 10, bookedCount: 1, planId: 'half-day-morning' },
      { id: 's-2', startAt: '2026-05-24T09:00:00+08:00', status: 'open', capacity: 10, bookedCount: 1, planId: 'half-day-morning' },
    ],
    urlDate: '2026-05-24',
    planId: 'half-day-morning',
  });

  assert.equal(result.selectedScheduleId, 's-2');
  assert.equal(result.validationError, null);
});

test('resolveInitialCheckoutSelection does not silently fallback when selected date unavailable', () => {
  const result = resolveInitialCheckoutSelection({
    schedules: [
      { id: 's-1', startAt: '2026-05-11T09:00:00+08:00', status: 'open', capacity: 10, bookedCount: 1, planId: 'half-day-morning' },
    ],
    urlDate: '2026-05-24',
    planId: 'half-day-morning',
  });

  assert.equal(result.selectedScheduleId, '');
  assert.equal(result.validationError, '你選擇的日期目前沒有此方案可預約，請重新選擇。');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { isBookingV2Enabled } from '../../src/config/feature-flags.mjs';

test('isBookingV2Enabled defaults to false', () => {
  assert.equal(isBookingV2Enabled({}), false);
});

test('isBookingV2Enabled accepts truthy variants', () => {
  assert.equal(isBookingV2Enabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: '1' }), true);
  assert.equal(isBookingV2Enabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: 'true' }), true);
  assert.equal(isBookingV2Enabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: 'YES' }), true);
  assert.equal(isBookingV2Enabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: 'on' }), true);
});

test('isBookingV2Enabled accepts falsey variants', () => {
  assert.equal(isBookingV2Enabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: '0' }), false);
  assert.equal(isBookingV2Enabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: 'false' }), false);
  assert.equal(isBookingV2Enabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: 'off' }), false);
  assert.equal(isBookingV2Enabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: '' }), false);
});

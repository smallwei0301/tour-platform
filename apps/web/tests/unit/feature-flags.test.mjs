import test from 'node:test';
import assert from 'node:assert/strict';
import { isBookingV2Enabled } from '../../src/config/feature-flags.mjs';

test('isBookingV2Enabled defaults to false when no runtime flag is provided', () => {
  assert.equal(isBookingV2Enabled({}), false);
});

test('isBookingV2Enabled follows runtime BOOKING_V2 default when NEXT_PUBLIC flag is absent', () => {
  assert.equal(isBookingV2Enabled({ BOOKING_V2: '1' }), true);
  assert.equal(isBookingV2Enabled({ BOOKING_V2: 'true' }), true);
  assert.equal(isBookingV2Enabled({ BOOKING_V2: '0' }), false);
});

test('isBookingV2Enabled allows explicit legacy fallback via NEXT_PUBLIC flag even if runtime default is on', () => {
  assert.equal(isBookingV2Enabled({ BOOKING_V2: '1', NEXT_PUBLIC_BOOKING_V2_ENABLED: '0' }), false);
  assert.equal(isBookingV2Enabled({ BOOKING_V2: 'true', NEXT_PUBLIC_BOOKING_V2_ENABLED: 'false' }), false);
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

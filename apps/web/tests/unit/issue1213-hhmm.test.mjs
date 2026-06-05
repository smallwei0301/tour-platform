// Issue #1213 — `addMinutesToHHMM` helper used by the admin schedule-create
// modal to seed `endHH` from `startHH + plan.duration_minutes`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { addMinutesToHHMM } from '../../src/lib/hhmm.ts';

test('addMinutesToHHMM: canonical 09:00 + 240 = 13:00 (half-day → half-day)', () => {
  assert.equal(addMinutesToHHMM('09:00', 240), '13:00');
});

test('addMinutesToHHMM: pads single-digit hours and minutes', () => {
  assert.equal(addMinutesToHHMM('09:00', 5), '09:05');
  assert.equal(addMinutesToHHMM('8:30', 90), '10:00');
});

test('addMinutesToHHMM: zero minutes = identity', () => {
  assert.equal(addMinutesToHHMM('09:00', 0), '09:00');
});

test('addMinutesToHHMM: crossing midnight clips at 23:59 (single-day modal)', () => {
  // 22:00 + 180 = 25:00 → 23:59
  assert.equal(addMinutesToHHMM('22:00', 180), '23:59');
  // 23:30 + 60  = 24:30 → 23:59
  assert.equal(addMinutesToHHMM('23:30', 60), '23:59');
});

test('addMinutesToHHMM: minutes < 0 clamps to 00:00', () => {
  assert.equal(addMinutesToHHMM('08:30', -10000), '00:00');
});

test('addMinutesToHHMM: malformed input returns the original string (avoid blanking the field)', () => {
  assert.equal(addMinutesToHHMM('bogus', 60), 'bogus');
  assert.equal(addMinutesToHHMM('25:00', 60), '25:00');     // hour out of range
  assert.equal(addMinutesToHHMM('09:99', 60), '09:99');     // minute out of range
  assert.equal(addMinutesToHHMM('', 60), '');
  // NaN minutes — leave the field alone.
  assert.equal(addMinutesToHHMM('09:00', NaN), '09:00');
});

test('addMinutesToHHMM: non-integer minutes are truncated (no fractional minutes)', () => {
  assert.equal(addMinutesToHHMM('09:00', 120.7), '11:00');
});

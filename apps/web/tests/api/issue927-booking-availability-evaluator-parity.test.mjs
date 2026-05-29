import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateBookingAvailability } from '../../src/lib/availability-v2/booking-availability-evaluator.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('GH-927 source guard: available-slots and booking-draft both use shared evaluator', () => {
  const availableSlotsPath = path.resolve(
    __dirname,
    '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts',
  );
  const bookingDraftPath = path.resolve(
    __dirname,
    '../../app/api/v2/bookings/draft/route.ts',
  );

  const availableSlotsSrc = readFileSync(availableSlotsPath, 'utf8');
  const bookingDraftSrc = readFileSync(bookingDraftPath, 'utf8');

  assert.match(availableSlotsSrc, /evaluateBookingAvailability\(/);
  assert.match(bookingDraftSrc, /evaluateBookingAvailability\(/);
});

test('GH-927 evaluator contract: selected schedule open -> authoritative available', () => {
  const out = evaluateBookingAvailability({
    guideId: 'g-1',
    activityId: 'a-1',
    planId: 'p-1',
    timezone: 'Asia/Taipei',
    participants: 2,
    dateFrom: '2026-07-01',
    dateTo: '2026-07-01',
    minParticipants: 1,
    rules: [],
    blackouts: [],
    bookings: [],
    plan: {
      id: 'p-1',
      activity_id: 'a-1',
      duration_minutes: 120,
      max_participants: 4,
      booking_type: 'scheduled',
    },
    selectedSchedule: {
      id: 's-1',
      activity_id: 'a-1',
      plan_id: 'p-1',
      start_at: '2026-07-01T09:00:00+08:00',
      end_at: '2026-07-01T11:00:00+08:00',
      capacity: 4,
      booked_count: 1,
      status: 'open',
    },
    selectedScheduleAuthority: 'authoritative',
  });

  assert.equal(out.available, true);
  assert.equal(out.selectedScheduleAuthority, 'authoritative');
  assert.equal(out.reasonCode, undefined);
  assert.equal(out.slots.length, 1);
  assert.equal(out.slots[0].capacityLeft, 3);
});

test('GH-927 evaluator contract: selected schedule closed -> unavailable with reason', () => {
  const out = evaluateBookingAvailability({
    guideId: 'g-1',
    activityId: 'a-1',
    planId: 'p-1',
    timezone: 'Asia/Taipei',
    participants: 1,
    dateFrom: '2026-07-01',
    dateTo: '2026-07-01',
    minParticipants: 1,
    rules: [],
    blackouts: [],
    bookings: [],
    plan: {
      id: 'p-1',
      activity_id: 'a-1',
      duration_minutes: 120,
      max_participants: 4,
      booking_type: 'scheduled',
    },
    selectedSchedule: {
      id: 's-1',
      activity_id: 'a-1',
      plan_id: 'p-1',
      start_at: '2026-07-01T09:00:00+08:00',
      end_at: '2026-07-01T11:00:00+08:00',
      capacity: 4,
      booked_count: 0,
      status: 'closed',
    },
    selectedScheduleAuthority: 'fallback',
  });

  assert.equal(out.available, false);
  assert.equal(out.selectedScheduleAuthority, 'fallback');
  assert.ok(out.reasonCode);
  assert.equal(Array.isArray(out.slots), true);
  assert.equal(out.slots.length, 0);
});

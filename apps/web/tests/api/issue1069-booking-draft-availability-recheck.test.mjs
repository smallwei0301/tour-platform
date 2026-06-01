import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateEffectiveBookingAvailability,
  shouldRejectDraftByEffectiveAvailability,
} from '../../src/lib/availability-v2/effective-booking-availability.ts';

const BASE = {
  guideId: 'g-1',
  activityId: 'a-1',
  planId: 'p-1',
  timezone: 'Asia/Taipei',
  participants: 2,
  dateFrom: '2026-07-01',
  dateTo: '2026-07-01',
  requestedStartAt: '2026-07-01T09:00:00+08:00',
  minParticipants: 2,
  rules: [],
  blackouts: [],
  bookings: [],
  plan: {
    id: 'p-1',
    activity_id: 'a-1',
    duration_minutes: 120,
    max_participants: 6,
    booking_type: 'scheduled',
  },
};

function ruleAtNine() {
  return {
    id: 'r-1',
    guide_id: 'g-1',
    activity_plan_id: 'p-1',
    weekday: 3,
    start_time_local: '09:00',
    end_time_local: '11:00',
    timezone: 'Asia/Taipei',
    slot_interval_minutes: 120,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    effective_from: null,
    effective_to: null,
    is_active: true,
  };
}

test('GH-1069 RED: no-slot decision keeps evaluator reason/message for draft reject parity', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE,
    participants: 1,
    minParticipants: 3,
    rules: [ruleAtNine()],
  });

  assert.equal(out.available, false);
  assert.equal(out.reasonCode, 'MIN_PARTICIPANTS_NOT_MET');
  assert.ok(out.messageZh?.length > 0);
});

test('GH-1069 RED: stale schedule fallback only passes when requested startAt exists in effective slots', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE,
    requestedStartAt: '2026-07-01T10:00:00+08:00',
    rules: [ruleAtNine()],
  });

  assert.equal(out.available, false);
  assert.equal(out.reasonCode, 'BOOKING_CONFLICT');
});

test('GH-1069 RED: authoritative selected schedule closed/full rejects even when generated slots exist', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE,
    rules: [ruleAtNine()],
    selectedScheduleAuthority: 'authoritative',
    selectedSchedule: {
      id: 's-closed',
      activity_id: 'a-1',
      plan_id: 'p-1',
      start_at: '2026-07-01T09:00:00+08:00',
      end_at: '2026-07-01T11:00:00+08:00',
      capacity: 6,
      booked_count: 0,
      status: 'closed',
    },
  });

  assert.equal(out.available, false);
  assert.equal(out.reasonCode, 'BOOKING_CONFLICT');
});

test('GH-1069 RED: stale schedule fallback cannot bypass effective generated unavailable decision', () => {
  const reject = shouldRejectDraftByEffectiveAvailability({
    scheduleValidatedBySourceOfTruth: true,
    generatedSlotValidation: {
      available: false,
      reasonCode: 'BOOKING_CONFLICT',
    },
  });

  assert.equal(reject, true);
});

test('GH-1069 RED: happy path keeps available=true and matched slot', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE,
    rules: [ruleAtNine()],
  });

  assert.equal(out.available, true);
  assert.equal(out.matchedSlot?.startAt, '2026-07-01T09:00:00+08:00');
});

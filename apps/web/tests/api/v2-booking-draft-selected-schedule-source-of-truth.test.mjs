import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDraftSlotAgainstSelectedSchedule,
  shouldRejectDraftWhenSelectedScheduleInvalid,
  pickFallbackDraftSelectedSchedule,
} from '../../src/lib/booking-v2-selected-schedule.ts';

const PLAN_ID = '57ad7d45-4fb1-4ed5-b860-72330b9afd1b';
const SCHEDULE_ID = 'f1917b79-42e3-481f-9f06-0284f6fda422';

test('GH-860 RED/GREEN: plan UUID + schedule-backed slot (2026-06-01, 4 pax) should be draft-acceptable when selected schedule is open/matching/capacity-ok', () => {
  const result = validateDraftSlotAgainstSelectedSchedule({
    schedule: {
      id: SCHEDULE_ID,
      activity_id: '11111111-1111-1111-1111-111111111111',
      plan_id: null,
      start_at: '2026-06-01T10:00:00+08:00',
      status: 'open',
      capacity: 8,
      booked_count: 2,
    },
    activityId: '11111111-1111-1111-1111-111111111111',
    resolvedPlanId: PLAN_ID,
    requestStartAt: '2026-06-01T10:00:00+08:00',
    slotDate: '2026-06-01',
    timezone: 'Asia/Taipei',
    participants: 4,
  });

  assert.equal(result.available, true);
});

test('GH-860 RED: stale schedule mismatch (startAt mismatch) should not force draft hard-reject when selectedSchedule is only a hint', () => {
  const selectedScheduleValidation = validateDraftSlotAgainstSelectedSchedule({
    schedule: {
      id: SCHEDULE_ID,
      activity_id: '11111111-1111-1111-1111-111111111111',
      plan_id: null,
      start_at: '2026-06-01T09:00:00+08:00',
      status: 'open',
      capacity: 8,
      booked_count: 2,
    },
    activityId: '11111111-1111-1111-1111-111111111111',
    resolvedPlanId: PLAN_ID,
    requestStartAt: '2026-06-01T10:00:00+08:00',
    slotDate: '2026-06-01',
    timezone: 'Asia/Taipei',
    participants: 4,
  });

  const shouldReject = shouldRejectDraftWhenSelectedScheduleInvalid({
    hasScheduleId: true,
    selectedScheduleValidation,
  });

  assert.equal(selectedScheduleValidation.available, false);
  assert.equal(selectedScheduleValidation.reason, 'SCHEDULE_START_MISMATCH');
  assert.equal(
    shouldReject,
    false,
    'startAt mismatch should be treated as stale hint and allow generated availability fallback'
  );
});

test('GH-860 RED: scheduleId resolves but selected schedule is closed, draft must not fallback to generated availability', () => {
  const selectedScheduleValidation = validateDraftSlotAgainstSelectedSchedule({
    schedule: {
      id: SCHEDULE_ID,
      activity_id: '11111111-1111-1111-1111-111111111111',
      plan_id: null,
      start_at: '2026-06-01T10:00:00+08:00',
      status: 'closed',
      capacity: 8,
      booked_count: 2,
    },
    activityId: '11111111-1111-1111-1111-111111111111',
    resolvedPlanId: PLAN_ID,
    requestStartAt: '2026-06-01T10:00:00+08:00',
    slotDate: '2026-06-01',
    timezone: 'Asia/Taipei',
    participants: 2,
  });

  const shouldReject = shouldRejectDraftWhenSelectedScheduleInvalid({
    hasScheduleId: true,
    selectedScheduleValidation,
  });

  assert.equal(selectedScheduleValidation.available, false);
  assert.equal(selectedScheduleValidation.reason, 'SCHEDULE_NOT_OPEN');
  assert.equal(
    shouldReject,
    true,
    'draft must hard-reject closed selected schedule even when generated availability says true'
  );
});

test('GH-860 RED: stale scheduleId should fallback to activity_schedules selectedSchedule for same startAt', () => {
  const fallback = pickFallbackDraftSelectedSchedule({
    schedules: [
      {
        id: 'closed-first',
        activity_id: '11111111-1111-1111-1111-111111111111',
        plan_id: null,
        start_at: '2026-06-01T10:00:00+08:00',
        status: 'closed',
        capacity: 8,
        booked_count: 0,
      },
      {
        id: 'open-target',
        activity_id: '11111111-1111-1111-1111-111111111111',
        plan_id: null,
        start_at: '2026-06-01T10:00:00+08:00',
        status: 'open',
        capacity: 8,
        booked_count: 2,
      },
    ],
    activityId: '11111111-1111-1111-1111-111111111111',
    resolvedPlanId: PLAN_ID,
    requestStartAt: '2026-06-01T10:00:00+08:00',
    slotDate: '2026-06-01',
    timezone: 'Asia/Taipei',
    participants: 4,
  });

  assert.equal(fallback?.schedule.id, 'open-target');
  assert.equal(fallback?.validation.available, true);
});

test('GH-860 RED: stale scheduleId fallback with only closed/full rows should not become authoritative reject', () => {
  const fallback = pickFallbackDraftSelectedSchedule({
    schedules: [
      {
        id: 'closed-only',
        activity_id: '11111111-1111-1111-1111-111111111111',
        plan_id: null,
        start_at: '2026-06-01T10:00:00+08:00',
        status: 'closed',
        capacity: 8,
        booked_count: 0,
      },
      {
        id: 'full-only',
        activity_id: '11111111-1111-1111-1111-111111111111',
        plan_id: null,
        start_at: '2026-06-01T10:00:00+08:00',
        status: 'open',
        capacity: 4,
        booked_count: 4,
      },
    ],
    activityId: '11111111-1111-1111-1111-111111111111',
    resolvedPlanId: PLAN_ID,
    requestStartAt: '2026-06-01T10:00:00+08:00',
    slotDate: '2026-06-01',
    timezone: 'Asia/Taipei',
    participants: 2,
  });

  assert.equal(fallback, null);
});

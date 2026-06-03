import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  findMatchingConflictOverride,
  serializeConflictOverrideForClient,
} from '../../src/lib/availability-v2/conflict-override.ts';
import { evaluateBookingAvailability } from '../../src/lib/availability-v2/booking-availability-evaluator.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const AVAILABLE_SLOTS_ROUTE = join(REPO_ROOT, 'app/api/v2/activities/[activityId]/available-slots/route-handler.ts');
const DRAFT_ROUTE = join(REPO_ROOT, 'app/api/v2/bookings/draft/route.ts');
const ADMIN_CONFLICT_OVERRIDE_ROUTE = join(
  REPO_ROOT,
  'app/api/v2/admin/guides/[guideId]/conflict-overrides/route.ts',
);

const TZ = 'Asia/Taipei';
const GUIDE_ID = 'g-override';
const ACTIVITY_ID = 'a-override';
const PLAN_ID = 'p-override';
const REQUEST_START = '2026-04-10T09:00:00+08:00';
const REQUEST_END = '2026-04-10T12:00:00+08:00';

function weekdayRule({ weekday, start = '09:00', end = '12:00' }) {
  return {
    id: `r-${weekday}-${start}`,
    guide_id: GUIDE_ID,
    activity_plan_id: PLAN_ID,
    weekday,
    start_time_local: start,
    end_time_local: end,
    timezone: TZ,
    slot_interval_minutes: 180,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    effective_from: null,
    effective_to: null,
    is_active: true,
  };
}

function activeBooking() {
  return {
    id: 'b-conflict',
    guide_id: GUIDE_ID,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    start_at: REQUEST_START,
    end_at: '2026-04-10T17:00:00+08:00',
    status: 'confirmed',
    participants: 2,
  };
}

function overrideRecord(overrides = {}) {
  return {
    id: 'ovr-1',
    guide_id: GUIDE_ID,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    start_at: REQUEST_START,
    end_at: REQUEST_END,
    reason: 'VIP 客訴補救，主管核准此場例外開放',
    requires_helper: true,
    helper_status: 'required',
    guide_note: '導遊已知悉需協調半日衝突',
    admin_note: '後台人工核准',
    status: 'active',
    created_at: '2026-04-01T00:00:00Z',
    created_by_admin_email: 'admin@example.com',
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    guideId: GUIDE_ID,
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    timezone: TZ,
    participants: 2,
    dateFrom: '2026-04-10',
    dateTo: '2026-04-10',
    minParticipants: 1,
    rules: [weekdayRule({ weekday: 5, end: '17:00' })],
    blackouts: [],
    bookings: [activeBooking()],
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      duration_minutes: 180,
      max_participants: 10,
      booking_type: 'scheduled',
    },
    planStatus: 'active',
    selectedSchedule: {
      id: 'sch-1',
      activity_id: ACTIVITY_ID,
      plan_id: PLAN_ID,
      start_at: REQUEST_START,
      end_at: REQUEST_END,
      capacity: 10,
      booked_count: 0,
      status: 'open',
    },
    selectedScheduleAuthority: 'authoritative',
    ...overrides,
  };
}

test('GH-1067 RED: exact active conflict override matches only same guide/activity/plan/start/end slot', () => {
  const matched = findMatchingConflictOverride({
    guideId: GUIDE_ID,
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    requestedStartAt: REQUEST_START,
    requestedEndAt: REQUEST_END,
    overrides: [overrideRecord()],
  });

  assert.ok(matched);
  assert.equal(matched?.id, 'ovr-1');
});

test('GH-1067 RED: wrong plan/date/time override is ignored', () => {
  const matched = findMatchingConflictOverride({
    guideId: GUIDE_ID,
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    requestedStartAt: REQUEST_START,
    requestedEndAt: REQUEST_END,
    overrides: [overrideRecord({ activity_plan_id: 'different-plan', end_at: '2026-04-10T17:00:00+08:00' })],
  });

  assert.equal(matched, null);
});

test('GH-1067 RED: disabled override never matches', () => {
  const matched = findMatchingConflictOverride({
    guideId: GUIDE_ID,
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    requestedStartAt: REQUEST_START,
    requestedEndAt: REQUEST_END,
    overrides: [overrideRecord({ status: 'disabled' })],
  });

  assert.equal(matched, null);
});

test('GH-1067 RED: selected schedule remains blocked_by_conflict without override even when capacity exists', () => {
  const out = evaluateBookingAvailability(baseInput());

  assert.equal(out.available, false);
  assert.equal(out.reasonCode, 'BOOKING_CONFLICT');
  assert.equal(out.slots.length, 0);
});

test('GH-1067 RED: exact active override makes selected conflicting slot bookable only as allowed_with_admin_override', () => {
  const out = evaluateBookingAvailability(
    baseInput({
      conflictOverrides: [overrideRecord()],
    }),
  );

  assert.equal(out.available, true);
  assert.equal(out.slots.length, 1);
  assert.equal(out.slots[0].canonicalState, 'allowed_with_admin_override');
  assert.equal(out.slots[0].conflictOverride?.id, 'ovr-1');
  assert.equal(out.slots[0].conflictOverride?.requiresHelper, true);
  assert.equal(out.slots[0].conflictOverride?.helperStatus, 'required');
});

test('GH-1067 RED: disabled/wrong override does not weaken conflict block', () => {
  const disabled = evaluateBookingAvailability(
    baseInput({
      conflictOverrides: [overrideRecord({ status: 'disabled' })],
    }),
  );
  assert.equal(disabled.available, false);
  assert.equal(disabled.reasonCode, 'BOOKING_CONFLICT');

  const wrongTime = evaluateBookingAvailability(
    baseInput({
      conflictOverrides: [overrideRecord({ start_at: '2026-04-10T13:00:00+08:00' })],
    }),
  );
  assert.equal(wrongTime.available, false);
  assert.equal(wrongTime.reasonCode, 'BOOKING_CONFLICT');
});

test('GH-1067 RED: serializeConflictOverrideForClient emits safe downstream metadata only', () => {
  const out = serializeConflictOverrideForClient(overrideRecord());
  assert.deepEqual(out, {
    id: 'ovr-1',
    reason: 'VIP 客訴補救，主管核准此場例外開放',
    requiresHelper: true,
    helperStatus: 'required',
    guideNote: '導遊已知悉需協調半日衝突',
    adminNote: '後台人工核准',
    createdAt: '2026-04-01T00:00:00Z',
    createdByAdminEmail: 'admin@example.com',
  });
});

test('Source contract: available-slots route reads conflict overrides and preserves allowed_with_admin_override slot state', () => {
  const src = readFileSync(AVAILABLE_SLOTS_ROUTE, 'utf8');
  assert.match(src, /guide_slot_conflict_overrides/);
  assert.match(src, /conflictOverrides/);
  assert.match(src, /allowed_with_admin_override/);
});

test('Source contract: draft route persists conflict override linkage and snapshot for later audit', () => {
  const src = readFileSync(DRAFT_ROUTE, 'utf8');
  assert.match(src, /conflict_override_id/);
  assert.match(src, /conflict_override_snapshot/);
  assert.match(src, /allowed_with_admin_override/);
});

test('Source contract: draft route carries override metadata into booking status log audit trail', () => {
  const src = readFileSync(DRAFT_ROUTE, 'utf8');
  const statusLogIdx = src.indexOf("from('booking_status_logs').insert(");
  assert.ok(statusLogIdx >= 0, 'expected booking_status_logs insert');
  const tail = src.slice(statusLogIdx, statusLogIdx + 1200);
  assert.match(tail, /conflictOverride/);
  assert.match(tail, /overrideId|conflict_override_id/);
});

test('Source contract: admin conflict override mutation route must guard auth before insert and require audit/helper fields', () => {
  const src = readFileSync(ADMIN_CONFLICT_OVERRIDE_ROUTE, 'utf8');
  assert.match(src, /pickAdminCredentials/);
  assert.match(src, /isAdminAuthorized/);
  assert.match(src, /getRequiredAdminToken/);
  assert.match(src, /requires_helper/);
  assert.match(src, /helper_status/);
  assert.match(src, /created_by_admin_email/);

  const authIdx = src.indexOf('isAdminAuthorized(');
  const insertIdx = src.indexOf('.insert(');
  assert.ok(authIdx >= 0, 'expected auth guard call');
  assert.ok(insertIdx >= 0, 'expected insert call');
  assert.ok(authIdx < insertIdx, 'auth guard must run before insert');
});

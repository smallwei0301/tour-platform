import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  findMatchingConflictOverride,
  serializeConflictOverrideForClient,
} from '../../src/lib/availability-v2/conflict-override.ts';
import {
  applyBookingConflictOverrideColumnFallback,
  loadConflictOverridesWithSchemaFallback,
} from '../../src/lib/conflict-override-schema-compat.mjs';
import { evaluateBookingAvailability } from '../../src/lib/availability-v2/booking-availability-evaluator.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const AVAILABLE_SLOTS_ROUTE = join(REPO_ROOT, 'app/api/v2/activities/[activityId]/available-slots/route-handler.ts');
const DRAFT_ROUTE = join(REPO_ROOT, 'app/api/v2/bookings/draft/route.ts');
const MIGRATION_PATH = join(
  REPO_ROOT,
  '..',
  '..',
  'supabase/migrations/20260603_issue1067_guide_slot_conflict_overrides.sql',
);

const TZ = 'Asia/Taipei';
const GUIDE_ID = 'g-override';
const ACTIVITY_ID = 'a-override';
const PLAN_ID = 'p-override';
const FUTURE_REQUEST_START = '2030-04-12T09:00:00+08:00';
const FUTURE_REQUEST_END = '2030-04-12T12:00:00+08:00';
const PAST_REQUEST_START = '2026-04-10T09:00:00+08:00';
const PAST_REQUEST_END = '2026-04-10T12:00:00+08:00';

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

function activeBooking(overrides = {}) {
  return {
    id: 'b-conflict',
    guide_id: GUIDE_ID,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    start_at: FUTURE_REQUEST_START,
    end_at: '2030-04-12T17:00:00+08:00',
    status: 'confirmed',
    participants: 2,
    ...overrides,
  };
}

function overrideRecord(overrides = {}) {
  return {
    id: 'ovr-1',
    guide_id: GUIDE_ID,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    start_at: FUTURE_REQUEST_START,
    end_at: FUTURE_REQUEST_END,
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
  const selectedSchedule = overrides.selectedSchedule ?? {
    id: 'sch-1',
    activity_id: ACTIVITY_ID,
    plan_id: PLAN_ID,
    start_at: FUTURE_REQUEST_START,
    end_at: FUTURE_REQUEST_END,
    capacity: 10,
    booked_count: 0,
    status: 'open',
  };
  const selectedDate = selectedSchedule.start_at.slice(0, 10);
  return {
    guideId: GUIDE_ID,
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    timezone: TZ,
    participants: 2,
    dateFrom: selectedDate,
    dateTo: selectedDate,
    minParticipants: 1,
    rules: [weekdayRule({ weekday: 5, end: '17:00' })],
    blackouts: [],
    bookings: [
      activeBooking({
        start_at: selectedSchedule.start_at,
        end_at: selectedSchedule.start_at.slice(0, 10) + 'T17:00:00+08:00',
      }),
    ],
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      duration_minutes: 180,
      max_participants: 10,
      booking_type: 'scheduled',
    },
    planStatus: 'active',
    selectedSchedule,
    selectedScheduleAuthority: 'authoritative',
    ...overrides,
  };
}

test('GH-1067 RED: exact active conflict override matches only same guide/activity/plan/start/end slot', () => {
  const matched = findMatchingConflictOverride({
    guideId: GUIDE_ID,
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    requestedStartAt: FUTURE_REQUEST_START,
    requestedEndAt: FUTURE_REQUEST_END,
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
    requestedStartAt: FUTURE_REQUEST_START,
    requestedEndAt: FUTURE_REQUEST_END,
    overrides: [overrideRecord({ activity_plan_id: 'different-plan', end_at: '2030-04-12T17:00:00+08:00' })],
  });

  assert.equal(matched, null);
});

test('GH-1067 RED: disabled override never matches', () => {
  const matched = findMatchingConflictOverride({
    guideId: GUIDE_ID,
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    requestedStartAt: FUTURE_REQUEST_START,
    requestedEndAt: FUTURE_REQUEST_END,
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

test('GH-1067 RED: exact active override makes future selected conflicting slot bookable only as allowed_with_admin_override', () => {
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

test('GH-1067 RED: exact active override must not reopen past selected schedule', () => {
  const out = evaluateBookingAvailability(
    baseInput({
      selectedSchedule: {
        id: 'sch-past',
        activity_id: ACTIVITY_ID,
        plan_id: PLAN_ID,
        start_at: PAST_REQUEST_START,
        end_at: PAST_REQUEST_END,
        capacity: 10,
        booked_count: 0,
        status: 'open',
      },
      conflictOverrides: [
        overrideRecord({
          start_at: PAST_REQUEST_START,
          end_at: PAST_REQUEST_END,
        }),
      ],
    }),
  );

  assert.equal(out.available, false);
  assert.equal(out.reasonCode, 'SLOT_IN_PAST');
  assert.equal(out.slots.length, 0);
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
      conflictOverrides: [overrideRecord({ start_at: '2030-04-12T13:00:00+08:00' })],
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

test('GH-1067 RED: loadConflictOverridesWithSchemaFallback degrades missing override table to empty list', async () => {
  const result = await loadConflictOverridesWithSchemaFallback(async () => ({
    data: null,
    error: { message: 'relation "guide_slot_conflict_overrides" does not exist' },
  }));

  assert.equal(result.error, null);
  assert.deepEqual(result.data, []);
  assert.equal(result.schemaFallback, 'missing_table');
});

test('GH-1067 RED: loadConflictOverridesWithSchemaFallback also degrades schema-cache missing public override table to empty list', async () => {
  const result = await loadConflictOverridesWithSchemaFallback(async () => ({
    data: null,
    error: {
      code: 'PGRST205',
      message: "Could not find the table 'public.guide_slot_conflict_overrides' in the schema cache",
    },
  }));

  assert.equal(result.error, null);
  assert.deepEqual(result.data, []);
  assert.equal(result.schemaFallback, 'missing_table');
});

test('GH-1067 RED: applyBookingConflictOverrideColumnFallback strips override-only booking columns on schema drift', async () => {
  const attempts = [];
  const result = await applyBookingConflictOverrideColumnFallback(async (payload) => {
    attempts.push({ ...payload });
    if ('conflict_override_id' in payload) {
      return {
        data: null,
        error: { message: 'column "conflict_override_id" of relation "bookings" does not exist' },
      };
    }
    if ('conflict_override_snapshot' in payload) {
      return {
        data: null,
        error: { message: "Could not find the 'conflict_override_snapshot' column of 'bookings' in the schema cache" },
      };
    }
    return { data: { id: 'booking-1' }, error: null };
  }, {
    traveler_id: 'traveler-1',
    guide_id: GUIDE_ID,
    conflict_override_id: 'ovr-1',
    conflict_override_snapshot: { id: 'ovr-1' },
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.data, { id: 'booking-1' });
  assert.deepEqual(result.droppedColumns, ['conflict_override_id', 'conflict_override_snapshot']);
  assert.equal(attempts.length, 3);
  assert.ok('conflict_override_id' in attempts[0]);
  assert.ok(!('conflict_override_id' in attempts[1]));
  assert.ok(!('conflict_override_snapshot' in attempts[2]));
});

test('Source contract: available-slots route reads conflict overrides via schema fallback and preserves allowed_with_admin_override slot state', () => {
  const src = readFileSync(AVAILABLE_SLOTS_ROUTE, 'utf8');
  assert.match(src, /loadConflictOverridesWithSchemaFallback/);
  assert.match(src, /guide_slot_conflict_overrides/);
  assert.match(src, /allowed_with_admin_override/);
});

test('Source contract: draft route uses schema fallback for override reads and strips override-only booking columns on schema drift', () => {
  const src = readFileSync(DRAFT_ROUTE, 'utf8');
  assert.match(src, /loadConflictOverridesWithSchemaFallback/);
  assert.match(src, /applyBookingConflictOverrideColumnFallback/);
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

test('GH-1067 RED: migration source contract formalizes override table, booking audit columns, and RLS guardrails', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');

  assert.match(migration, /create table if not exists public\.guide_slot_conflict_overrides/i);
  assert.match(migration, /id\s+uuid\s+primary key\s+default\s+gen_random_uuid\(\)/i);
  assert.match(migration, /guide_id\s+uuid\s+not null/i);
  assert.match(migration, /activity_id\s+uuid\s+not null/i);
  assert.match(migration, /activity_plan_id\s+uuid\s+not null/i);
  assert.match(migration, /start_at\s+timestamptz\s+not null/i);
  assert.match(migration, /end_at\s+timestamptz\s+not null/i);
  assert.match(migration, /reason\s+text\s+not null/i);
  assert.match(migration, /check\s*\(\s*btrim\(reason\)\s*<>\s*''\s*\)/i);
  assert.match(migration, /requires_helper\s+boolean\s+not null\s+default\s+false/i);
  assert.match(migration, /helper_status\s+text\s+not null\s+default\s+'not_needed'/i);
  assert.match(migration, /helper_status[\s\S]*not_needed[\s\S]*required[\s\S]*pending_assignment[\s\S]*assigned[\s\S]*declined/i);
  assert.match(migration, /guide_note\s+text/i);
  assert.match(migration, /admin_note\s+text/i);
  assert.match(migration, /status\s+text\s+not null\s+default\s+'active'/i);
  assert.match(migration, /status[\s\S]*active[\s\S]*disabled[\s\S]*cancelled/i);
  assert.match(migration, /created_at\s+timestamptz\s+not null\s+default\s+now\(\)/i);
  assert.match(migration, /created_by_admin_email\s+text/i);
  assert.match(migration, /alter table public\.guide_slot_conflict_overrides enable row level security/i);
  assert.match(migration, /create policy "Guide slot conflict overrides read for anonymous"/i);
  assert.match(migration, /for select[\s\S]*to anon/i);
  assert.match(migration, /create policy "Guide slot conflict overrides mutate for service role"/i);
  assert.match(migration, /for all[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /for\s+(insert|update|delete|all)[\s\S]*to\s+(anon|authenticated)/i);
  assert.match(migration, /alter table public\.bookings[\s\S]*add column if not exists conflict_override_id\s+uuid/i);
  assert.match(migration, /alter table public\.bookings[\s\S]*add column if not exists conflict_override_snapshot\s+jsonb/i);
  assert.match(migration, /comment on table public\.guide_slot_conflict_overrides/i);
  assert.match(migration, /must not be treated as ordinary availability/i);
});

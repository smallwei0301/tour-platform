import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  isOrderEligibleForSettlement,
  isOrderInReminderWindow,
  resolveReminderActivityAndStart,
} from '../../src/lib/internal-sweep-time-source.ts';

const ROOT = process.cwd();

test('issue621 /api/orders legacy guard only hard-blocks under explicit BOOKING_V2_PRIMARY mode', async () => {
  const rel = 'app/api/orders/route.ts';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  assert.match(src, /BOOKING_V2_PRIMARY/, 'orders route must use explicit BOOKING_V2_PRIMARY hard-block gate');

  assert.doesNotMatch(
    src,
    /BOOKING_V2_PRIMARY\s*\?\?\s*process\.env\.BOOKING_V2/,
    'orders route must not auto-hard-block legacy /api/orders under broad BOOKING_V2 shell flag'
  );

  assert.match(
    src,
    /legacy|x-order-path-mode|x-order-route-mode/,
    'orders route must keep explicit legacy opt-in signal and diagnostic header for observability'
  );

  assert.match(
    src,
    /LEGACY_ONLY|ORDER_ROUTE_LEGACY_ONLY|status:\s*410|status:\s*403/,
    'orders route must reject normal traffic with explicit legacy-only error contract under V2 primary mode'
  );
});

test('issue621 internal sweeps should prefer V2 booking start_at with legacy schedule fallback and truthful policy diagnostics', async () => {
  const reminderSrc = await readFile(path.join(ROOT, 'app/api/internal/reminders/pre-tour-sweep/route.ts'), 'utf8');
  const settlementSrc = await readFile(path.join(ROOT, 'app/api/internal/settlement/sweep/route.ts'), 'utf8');
  const reminderLogMigration = await readFile(
    path.join(ROOT, '../../supabase/migrations/20260522_issue621_allow_null_schedule_id_in_tour_reminder_log.sql'),
    'utf8'
  );

  assert.match(reminderSrc, /booking_id/, 'reminder sweep query should read orders.booking_id for V2-linked orders');
  assert.match(
    reminderSrc,
    /bookings\s*\([^)]*start_at/s,
    'reminder sweep should include bookings.start_at join payload for V2 canonical time source'
  );
  assert.match(
    reminderSrc,
    /activity_schedules\s*\(\s*id,\s*start_at/i,
    'reminder sweep should keep legacy activity_schedules.start_at payload as fallback for historical orders'
  );
  assert.doesNotMatch(
    reminderSrc,
    /activity_schedules!inner\s*\(/i,
    'reminder sweep must not use inner join that would pre-exclude V2-only rows without legacy schedule'
  );

  assert.match(settlementSrc, /booking_id/, 'settlement sweep query should read orders.booking_id for V2-linked orders');
  assert.match(
    settlementSrc,
    /bookings\s*\([^)]*start_at/s,
    'settlement sweep should include bookings.start_at join payload for V2 canonical time source'
  );
  assert.match(
    settlementSrc,
    /activity_schedules\(start_at\)/i,
    'settlement sweep should keep legacy activity_schedules.start_at payload as fallback for historical orders'
  );
  assert.doesNotMatch(
    settlementSrc,
    /activity_schedules!inner\(start_at\)/i,
    'settlement sweep must not use inner join that would pre-exclude V2-only rows without legacy schedule'
  );

  assert.match(
    reminderSrc,
    /time_source_policy:\s*timeSourcePolicy|timeSourcePolicy\s*=\s*'booking_v2_then_legacy_fallback'/,
    'reminder sweep should report booking_v2_then_legacy_fallback policy in diagnostics'
  );
  assert.match(
    settlementSrc,
    /time_source_policy:\s*settlementSourcePolicy|settlementSourcePolicy\s*=\s*'booking_v2_then_legacy_fallback'/,
    'settlement sweep should report booking_v2_then_legacy_fallback policy in diagnostics'
  );

  assert.match(
    reminderSrc,
    /onConflict:\s*'order_id,\s*reminder_kind,\s*channel'/,
    'reminder log upsert must keep idempotency key on order_id, reminder_kind, channel for V2 and legacy rows'
  );

  assert.match(
    reminderLogMigration,
    /ALTER\s+TABLE\s+tour_reminder_log\s+ALTER\s+COLUMN\s+schedule_id\s+DROP\s+NOT\s+NULL/i,
    'tour_reminder_log migration must allow null schedule_id for V2-only rows without legacy schedules'
  );
});

test('issue621 regression: reminder row resolver keeps V2-only rows without legacy schedule and falls back to legacy schedule metadata', () => {
  const v2OnlyRow = {
    bookings: {
      start_at: '2026-06-01T01:00:00.000Z',
      activities: {
        title: 'V2 海岸線步道',
        meeting_point: '東門集合',
        meeting_point_map_url: 'https://maps.example/v2',
        notices: '請攜帶雨具',
      },
    },
    activity_schedules: [],
  };

  const v2Resolved = resolveReminderActivityAndStart(v2OnlyRow);
  assert.equal(v2Resolved.effectiveStartAt, '2026-06-01T01:00:00.000Z');
  assert.equal(v2Resolved.scheduleId, null);
  assert.equal(v2Resolved.activity?.title, 'V2 海岸線步道');

  const inReminderWindow = isOrderInReminderWindow(
    v2Resolved.effectiveStartAt,
    '2026-06-01T00:30:00.000Z',
    '2026-06-01T01:30:00.000Z'
  );
  assert.equal(inReminderWindow, true, 'reminder sweep must include V2-only rows when booking.start_at falls in window');

  const eligibleForSettlement = isOrderEligibleForSettlement(v2Resolved.effectiveStartAt, '2026-06-01T02:00:00.000Z');
  assert.equal(eligibleForSettlement, true, 'settlement sweep must include V2-only rows when booking.start_at is before cutoff');

  const legacyRow = {
    bookings: { start_at: null, activities: null },
    activity_schedules: [
      {
        id: 'sched_legacy_1',
        start_at: '2026-06-02T03:00:00.000Z',
        activities: {
          title: 'Legacy 山徑行程',
          meeting_point: '西門捷運站',
          meeting_point_map_url: 'https://maps.example/legacy',
          notices: null,
        },
      },
    ],
  };

  const legacyResolved = resolveReminderActivityAndStart(legacyRow);
  assert.equal(legacyResolved.effectiveStartAt, '2026-06-02T03:00:00.000Z');
  assert.equal(legacyResolved.scheduleId, 'sched_legacy_1');
  assert.equal(legacyResolved.activity?.title, 'Legacy 山徑行程');
});

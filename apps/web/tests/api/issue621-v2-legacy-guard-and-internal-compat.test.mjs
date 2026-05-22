import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  isOrderEligibleForSettlement,
  isOrderInReminderWindow,
  pickEffectiveStartAt,
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
});

test('issue621 regression: V2-linked order with booking_id but no legacy schedule is still eligible by booking start_at', () => {
  const bookingStartAt = '2026-06-01T01:00:00.000Z';
  const effectiveStartAt = pickEffectiveStartAt(bookingStartAt, null);
  assert.equal(effectiveStartAt, bookingStartAt, 'effective time should prefer booking.start_at for V2-linked rows');

  const inReminderWindow = isOrderInReminderWindow(
    effectiveStartAt,
    '2026-06-01T00:30:00.000Z',
    '2026-06-01T01:30:00.000Z'
  );
  assert.equal(inReminderWindow, true, 'reminder sweep must include V2-only rows when booking.start_at falls in window');

  const eligibleForSettlement = isOrderEligibleForSettlement(effectiveStartAt, '2026-06-01T02:00:00.000Z');
  assert.equal(eligibleForSettlement, true, 'settlement sweep must include V2-only rows when booking.start_at is before cutoff');
});

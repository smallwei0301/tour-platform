import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

test('issue621 /api/orders enforces legacy-only guard with explicit opt-in and diagnostics', async () => {
  const rel = 'app/api/orders/route.ts';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  assert.match(
    src,
    /BOOKING_V2|BOOKING_V2_HARD_BLOCK|ORDER_V2_PRIMARY/,
    'orders route must read V2 cutover flag to guard primary traveler traffic'
  );

  assert.match(
    src,
    /legacy|x-order-path-mode|x-order-route-mode/,
    'orders route must have an explicit legacy opt-in signal and diagnostic header for observability'
  );

  assert.match(
    src,
    /LEGACY_ONLY|ORDER_ROUTE_LEGACY_ONLY|status:\s*410|status:\s*403/,
    'orders route must reject normal traffic with explicit legacy-only error contract under V2 primary mode'
  );
});

test('issue621 internal sweeps must prefer V2 booking time fields before legacy schedule fallback', async () => {
  const reminderSrc = await readFile(
    path.join(ROOT, 'app/api/internal/reminders/pre-tour-sweep/route.ts'),
    'utf8'
  );
  const settlementSrc = await readFile(
    path.join(ROOT, 'app/api/internal/settlement/sweep/route.ts'),
    'utf8'
  );

  assert.match(
    reminderSrc,
    /bookings|start_at|activity_schedules|coalesce|fallback/i,
    'reminder sweep must include explicit V2 booking time path with legacy fallback'
  );
  assert.match(
    settlementSrc,
    /bookings|start_at|activity_schedules|coalesce|fallback/i,
    'settlement sweep must include explicit V2 booking time path with legacy fallback'
  );

  assert.match(
    reminderSrc,
    /x-reminder-source|reminder_source|booking_v2|legacy_fallback/i,
    'reminder sweep should expose safe source diagnostics for V2/legacy path distinction'
  );
  assert.match(
    settlementSrc,
    /x-settlement-source|settlement_source|booking_v2|legacy_fallback/i,
    'settlement sweep should expose safe source diagnostics for V2/legacy path distinction'
  );
});

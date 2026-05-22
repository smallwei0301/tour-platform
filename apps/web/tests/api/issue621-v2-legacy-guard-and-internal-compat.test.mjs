import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

test('issue621 /api/orders legacy guard only hard-blocks under explicit BOOKING_V2_PRIMARY mode', async () => {
  const rel = 'app/api/orders/route.ts';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  assert.match(
    src,
    /BOOKING_V2_PRIMARY/,
    'orders route must use explicit BOOKING_V2_PRIMARY hard-block gate'
  );

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

test('issue621 internal sweeps must not claim booking_v2 time-source policy before real V2 booking-time read is implemented', async () => {
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
    /activity_schedules!inner\s*\(\s*id,\s*start_at/i,
    'reminder sweep currently reads legacy activity_schedules.start_at and should document that source honestly'
  );
  assert.match(
    settlementSrc,
    /activity_schedules!inner\(start_at\)/i,
    'settlement sweep currently reads legacy activity_schedules.start_at and should document that source honestly'
  );

  assert.doesNotMatch(
    reminderSrc,
    /booking_v2_then_legacy_fallback/,
    'reminder sweep must not claim booking_v2 fallback policy until V2 booking-time source is wired'
  );
  assert.doesNotMatch(
    settlementSrc,
    /booking_v2_then_legacy_fallback/,
    'settlement sweep must not claim booking_v2 fallback policy until V2 booking-time source is wired'
  );

  assert.match(
    reminderSrc,
    /reminder_source:\s*'legacy_fallback'/,
    'reminder sweep response should still expose legacy source diagnostic'
  );
  assert.match(
    settlementSrc,
    /settlement_source:\s*'legacy_fallback'/,
    'settlement sweep response should still expose legacy source diagnostic'
  );
});

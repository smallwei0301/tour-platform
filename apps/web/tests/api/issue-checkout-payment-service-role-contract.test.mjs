/**
 * Regression contract: every route that reads/writes the `payments` /
 * `payment_events` tables AND authenticates with the anon SSR client
 * (`createClient()` from supabase/server) must run those table operations
 * through a service-role client.
 *
 * Issue #614 hardening (migration 20260519120000) ran
 *   REVOKE ALL ON TABLE payments       FROM anon, authenticated, public;
 *   REVOKE ALL ON TABLE payment_events FROM anon, authenticated, public;
 * locking both tables to `service_role`. After that:
 *   - WRITE paths on the anon client raise "permission denied for table
 *     payments" → 500 (e.g. the traveler checkout "Failed to check existing
 *     payment"; admin POS manual / additional payment).
 *   - READ paths on the anon client return empty, silently dropping payment
 *     history from admin order / booking timelines.
 *
 * These source-contract assertions lock the privileged payment-table operations
 * onto a service-role client across the whole payment surface.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../../app');

// Routes that authenticate with the anon SSR client but must touch the
// service_role-only payment tables through a service-role client.
const ROUTES = [
  'api/v2/bookings/[bookingId]/checkout/route.ts',
  'api/v2/admin/orders/[orderId]/timeline/route.ts',
  'api/v2/admin/pos/orders/[orderId]/additional-payment/route.ts',
  'api/v2/admin/pos/bookings/[bookingId]/route.ts',
  'api/v2/admin/pos/bookings/[bookingId]/manual-payment/route.ts',
];

for (const rel of ROUTES) {
  const src = readFileSync(join(APP, rel), 'utf8');

  test(`${rel}: constructs a service-role Supabase client`, () => {
    assert.match(
      src,
      /createServiceClient\(\s*getSupabaseUrl\(\)!?\s*,\s*getSupabaseServiceRoleKey\(\)!?\s*\)/,
      'expected a createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) call'
    );
  });

  test(`${rel}: never queries payments through the anon SSR client`, () => {
    // The anon client is bound to `supabase` (await createClient()); after #614
    // it has no grants on payments.
    assert.doesNotMatch(
      src,
      /\bsupabase\s*\n?\s*\.from\(\s*['"]payments['"]\s*\)/,
      'payments must not be accessed via the anon `supabase` client'
    );
  });

  test(`${rel}: never queries payment_events through the anon SSR client`, () => {
    assert.doesNotMatch(
      src,
      /\bsupabase\s*\n?\s*\.from\(\s*['"]payment_events['"]\s*\)/,
      'payment_events must not be accessed via the anon `supabase` client'
    );
  });

  test(`${rel}: routes payment tables through the service-role client`, () => {
    // At least one payments / payment_events access must go through paymentDb.
    assert.match(
      src,
      /paymentDb\s*\n?\s*\.from\(\s*['"](payments|payment_events)['"]\s*\)/,
      'expected paymentDb.from("payments"|"payment_events")'
    );
  });
}

// The traveler checkout idempotency read is the exact path that surfaced
// "Failed to check existing payment" — pin it explicitly.
test('checkout idempotency read + payment insert + event insert use paymentDb', () => {
  const src = readFileSync(
    join(APP, 'api/v2/bookings/[bookingId]/checkout/route.ts'),
    'utf8'
  );
  assert.match(
    src,
    /paymentDb\s*\n?\s*\.from\(\s*['"]payments['"]\s*\)\s*\n?\s*\.select\([^)]*trade_no/,
    'existing-payment lookup must run on paymentDb'
  );
  assert.match(
    src,
    /paymentDb\s*\n?\s*\.from\(\s*['"]payments['"]\s*\)\s*\n?\s*\.insert\(/,
    'payment insert must run on paymentDb'
  );
  assert.match(
    src,
    /paymentDb\.from\(\s*['"]payment_events['"]\s*\)\s*\n?\s*\.insert\(/,
    'payment_events insert must run on paymentDb'
  );
});

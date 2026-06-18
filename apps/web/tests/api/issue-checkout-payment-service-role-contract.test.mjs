/**
 * Regression contract: V2 checkout route must access the payments / payment_events
 * tables through a service-role client.
 *
 * Issue #614 hardening (migration 20260519120000) ran
 *   REVOKE ALL ON TABLE payments       FROM anon, authenticated, public;
 *   REVOKE ALL ON TABLE payment_events FROM anon, authenticated, public;
 * and locked both tables to the `service_role` only.
 *
 * The checkout route authenticates the traveler with the anon SSR client
 * (`createClient()` from supabase/server). If that same anon client is used to
 * read/write `payments` / `payment_events`, Postgres returns
 * "permission denied for table payments", which the route surfaces to the user
 * as the 500 error "Failed to check existing payment" (see screenshot report).
 *
 * These source-contract assertions lock the privileged payment-table operations
 * onto a service-role client so the checkout flow keeps working after the #614
 * grant hardening.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routePath = join(
  __dirname,
  '../../app/api/v2/bookings/[bookingId]/checkout/route.ts'
);

const src = readFileSync(routePath, 'utf8');

test('checkout route constructs a service-role Supabase client', () => {
  assert.match(src, /createServiceClient\(\s*process\.env\.SUPABASE_URL!?\s*,\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY!?\s*\)/);
});

test('payments table is never queried through the anon SSR client', () => {
  // The anon client is bound to `supabase` (await createClient()). After #614 it
  // has no grants on payments — so it must not touch that table.
  assert.doesNotMatch(src, /supabase\s*\n?\s*\.from\(\s*['"]payments['"]\s*\)/);
});

test('payment_events table is never written through the anon SSR client', () => {
  assert.doesNotMatch(src, /supabase\s*\n?\s*\.from\(\s*['"]payment_events['"]\s*\)/);
});

test('existing-payment idempotency read goes through the service-role client', () => {
  // The reusable-payment lookup that produced "Failed to check existing payment"
  // must run on the service-role client.
  assert.match(
    src,
    /paymentDb\s*\n?\s*\.from\(\s*['"]payments['"]\s*\)\s*\n?\s*\.select\([^)]*trade_no/
  );
});

test('payment record insert goes through the service-role client', () => {
  assert.match(src, /paymentDb\s*\n?\s*\.from\(\s*['"]payments['"]\s*\)\s*\n?\s*\.insert\(/);
});

test('payment_events insert goes through the service-role client', () => {
  assert.match(src, /paymentDb\s*\n?\s*\.from\(\s*['"]payment_events['"]\s*\)\s*\n?\s*\.insert\(/);
});

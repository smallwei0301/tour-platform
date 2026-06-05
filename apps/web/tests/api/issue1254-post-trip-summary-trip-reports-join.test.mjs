// Issue #1254 — post-trip-summary returned 500 PGRST200 for every
// authenticated admin request because the route embedded
// `guide_trip_reports(submitted_at)` directly off `orders`, but orders
// has no FK to guide_trip_reports (the relation is two-hop through
// bookings). These source-contract tests pin the Option B fix
// (separate query keyed on booking_id) so a future refactor can't
// silently regress to the broken embed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ROUTE_PATH = join(
  REPO_ROOT,
  'app/api/v2/admin/orders/post-trip-summary/route.ts',
);

test('#1254 fix: route no longer uses the broken `guide_trip_reports(...)` embed off orders', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // The .select(...) string on the orders query must not contain a
  // bare guide_trip_reports(...) embed. Catch both `guide_trip_reports(`
  // and `guide_trip_reports (` defensively.
  assert.doesNotMatch(
    src,
    /\.select\(\s*[`'"][^`'"]*guide_trip_reports\s*\(/,
    'orders.select(...) must NOT embed guide_trip_reports — no direct FK to embed off',
  );
});

test('#1254 fix: route loads guide_trip_reports via a separate query keyed on booking_id (Option B split-query)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /\.from\(\s*['"]guide_trip_reports['"]\s*\)/,
    'separate .from("guide_trip_reports") query expected',
  );
  // The separate query must filter on booking_id with the IN() operator
  // (the booking_ids harvested from the loaded orders).
  assert.match(
    src,
    /\.in\(\s*['"]booking_id['"]\s*,/,
    'separate query must filter via .in("booking_id", bookingIds)',
  );
});

test('#1254 fix: route filters separate query to status=submitted (skips revised draft rows)', () => {
  // The migration declares status enum 'submitted' | 'revised'. Only
  // submitted rows count toward "tripReportStatus = submitted" — revised
  // rows are audit history and must not collapse a never-submitted
  // booking into the submitted bucket.
  const src = readFileSync(ROUTE_PATH, 'utf8');
  const fromIdx = src.indexOf(".from('guide_trip_reports')");
  assert.ok(fromIdx > 0, 'expected .from("guide_trip_reports") in route');
  const block = src.slice(fromIdx, fromIdx + 400);
  assert.match(block, /\.eq\(\s*['"]status['"]\s*,\s*['"]submitted['"]/);
});

test('#1254 fix: separate query is skipped when no eligible booking_ids (no empty IN clause)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // Locate the second-query block.
  const fromIdx = src.indexOf(".from('guide_trip_reports')");
  assert.ok(fromIdx > 0);
  // The second query should be guarded so we don't run .in('booking_id', [])
  // which is wasteful and (in some Supabase clients) ambiguous.
  // Look for `if (bookingIds.length > 0)` (or `bookingIds.length >`)
  // wrapping the second query.
  const guardWindow = src.slice(Math.max(0, fromIdx - 200), fromIdx);
  assert.match(
    guardWindow,
    /bookingIds\.length\s*>\s*0/,
    'separate query should be guarded by bookingIds.length > 0',
  );
});

test('#1254 fix: result join uses a Map for O(1) lookup keyed on booking_id', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /new Map<\s*string\s*,\s*string\s*>\(\)|tripReportSubmittedAtByBookingId/,
    'expected a Map<booking_id, submitted_at> for O(1) join into the order loop',
  );
});

test('#1254: existing tripReportStatus / payout / review-invitation helpers still wired', () => {
  // Lock the surrounding contract — the Option B fix only changed the
  // submittedAt source-of-truth, NOT which helpers consume it.
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /tripReportStatus\(/);
  assert.match(src, /isReviewInvitationEligible\(/);
  assert.match(src, /isPayoutOnHold\(/);
  assert.match(src, /adminFollowupCategory\(/);
});

test('#1254: route preserves the 422 INVALID_DATE / INVALID_CATEGORY guards (no behavioral change to validation)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /INVALID_DATE/);
  assert.match(src, /INVALID_CATEGORY/);
});

test('#1254: route preserves the success envelope shape (overdueTripReports, readyForReviewInvitation, payoutOnHold, adminFollowupNeeded)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /overdueTripReports/);
  assert.match(src, /readyForReviewInvitation/);
  assert.match(src, /payoutOnHold/);
  assert.match(src, /adminFollowupNeeded/);
});

test('#1254: handles separate-query DB error (returns 500 DB_ERROR, does not silently swallow)', () => {
  // The second query also needs its own error branch — silently
  // ignoring tripReportsError would let the route claim "no reports
  // submitted" for everyone and overcount overdue.
  const src = readFileSync(ROUTE_PATH, 'utf8');
  const fromIdx = src.indexOf(".from('guide_trip_reports')");
  const block = src.slice(fromIdx, fromIdx + 700);
  assert.match(
    block,
    /tripReportsError/,
    'separate query must capture its own error variable',
  );
  assert.match(
    block,
    /errorV2\(\s*['"]DB_ERROR['"]/,
    'separate-query error must surface as DB_ERROR (parallel to the orders query)',
  );
});

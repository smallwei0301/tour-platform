/**
 * Issue #1179 — Admin V2 activity plan archive action fails on plans page
 *
 * Root cause: DELETE /api/v2/admin/activities/:id/plans/:planId silently
 * falls back to status='inactive' when the 'archived' CHECK constraint is
 * missing from the DB, then returns { archived: true } without re-reading
 * the row. Operator sees a no-op — plan appears "archived" in UI but is
 * actually inactive.
 *
 * Fix strategy (source-contract TDD):
 *  AC4 — DELETE handler must NOT silently fall back to inactive; if the
 *        archived update fails the constraint, return HTTP 422
 *        SCHEMA_MISMATCH with a clear zh-TW message.
 *  AC4b — If the archived update succeeds, re-read the row to verify
 *         final status and return { archived: true, finalStatus: 'archived' }.
 *  AC3 — availability query already excludes non-active plans:
 *         .eq('status', 'active') in activity-day-availability.ts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const ROUTE_PATH = join(
  REPO_ROOT,
  'app/api/v2/admin/activities/[activityId]/plans/[planId]/route.ts',
);
const AVAILABILITY_PATH = join(
  REPO_ROOT,
  'src/lib/availability-v2/activity-day-availability.ts',
);

// ---------------------------------------------------------------------------
// AC4: No silent fallback — source-contract assertions
// ---------------------------------------------------------------------------

test('AC4: DELETE route does NOT fall back to status=inactive after archived fails', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');

  // The silent fallback block previously contained both:
  //   /status/i.test(String(error.message …
  //   status: 'inactive'
  // together. Neither pattern should coexist with an archived-constraint branch.

  // Confirm there is no /status/i catch-and-retry-with-inactive pattern.
  const hasSilentFallbackRegex = /\/status\/i\.test\(.*\n.*status:\s*'inactive'/s.test(src);
  assert.equal(
    hasSilentFallbackRegex,
    false,
    "DELETE handler must not silently catch status-constraint errors and retry with 'inactive'",
  );

  // The word 'inactive' should not appear in a fallback update block.
  // Allow for the word to exist in comments or VALID_STATUSES list only.
  const inactiveInUpdate = /update\(\s*\{[^}]*status:\s*'inactive'/.test(src);
  assert.equal(
    inactiveInUpdate,
    false,
    "DELETE handler must not update to status='inactive' as a fallback",
  );
});

test('AC4: DELETE route returns HTTP 422 SCHEMA_MISMATCH when archived update fails constraint', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');

  // Must have SCHEMA_MISMATCH error code in the DELETE handler
  assert.match(
    src,
    /SCHEMA_MISMATCH/,
    'DELETE handler must return SCHEMA_MISMATCH code when archived update fails',
  );

  // Must return 422 (not 500) for schema constraint failure
  assert.match(
    src,
    /status:\s*422/,
    'DELETE handler must use HTTP 422 for schema constraint mismatch',
  );
});

test('AC4: DELETE route includes zh-TW message for schema mismatch', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /封存狀態/,
    "DELETE handler must include zh-TW message mentioning '封存狀態' for schema mismatch",
  );
});

// ---------------------------------------------------------------------------
// AC4b: Re-read row after successful archive — source-contract assertions
// ---------------------------------------------------------------------------

test('AC4b: DELETE route re-reads row after archived update to verify final status', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');

  // After a successful update, there must be a second .select() or .single()
  // call to confirm the final status, and the response must include finalStatus.
  assert.match(
    src,
    /finalStatus/,
    "DELETE response must include 'finalStatus' field confirming the persisted status",
  );
});

test('AC4b: DELETE route response reflects actual DB status (not hardcoded true)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');

  // The old code returned: successV2({ archived: true })
  // New code must derive archived from the re-read status, not hardcode it.
  // We check that 'archived: true' does not appear as a plain literal;
  // it should be computed as `archived: status === 'archived'` or similar.
  const hardcodedArchivedTrue = /successV2\(\s*\{\s*archived:\s*true\s*\}\s*\)/.test(src);
  assert.equal(
    hardcodedArchivedTrue,
    false,
    "DELETE must not return hardcoded { archived: true } — derive from re-read status",
  );
});

// ---------------------------------------------------------------------------
// AC3: Archived plans excluded from availability — source-contract
// ---------------------------------------------------------------------------

test('AC3: availability query filters activity_plans to status=active only', () => {
  const src = readFileSync(AVAILABILITY_PATH, 'utf8');

  // The query must filter plans to active only so archived plans are invisible
  // to travelers browsing slots.
  assert.match(
    src,
    /\.eq\(\s*['"]status['"]\s*,\s*['"]active['"]\s*\)/,
    "activity-day-availability must filter activity_plans with .eq('status', 'active')",
  );
});

test('AC3: availability query does not include archived in status filter', () => {
  const src = readFileSync(AVAILABILITY_PATH, 'utf8');

  // There must be no .in('status', [..., 'archived', ...]) for plans
  const archivedInPlanQuery = /from\('activity_plans'\)[^;]*\.in\('status'[^)]*archived/.test(src);
  assert.equal(
    archivedInPlanQuery,
    false,
    "activity-day-availability must not include 'archived' in the plans status filter",
  );
});

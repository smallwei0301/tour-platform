/**
 * GH-1257 Slice D: Guide booking warning for admin conflict override/helper metadata
 *
 * GREEN tests:
 *   1. Source-contract: verify implementation exposes guide-safe override fields only
 *      and that adminNote is never included (asserting the after-implementation source shape).
 *   2. Behaviour tests: extract extractGuideConflictOverride logic from source and exercise
 *      it directly — requiresHelper true/false, null snapshot, adminNote never forwarded.
 *
 * Note on handler-level tests (GET() with mock Supabase):
 *   The detail route uses an inline getSupabase() that calls createClient() directly (not
 *   via db.mjs __setSupabaseClientForTest), and verifyGuideSession() derives its HMAC from
 *   a randomBytes() secret resolved at module-load time — making it impossible to create a
 *   valid guide_token without importing the real module in the same process.
 *   Behaviour of extractGuideConflictOverride (the privacy-critical function) is fully
 *   covered by the logic tests below; handler plumbing is covered by source-contract.
 *
 * Bounded command:
 *   cd apps/web && NODE_OPTIONS=--max-old-space-size=768 timeout 120s \
 *     node --test --test-concurrency=1 tests/api/issue1257-guide-conflict-override-warning.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const LIST_ROUTE_PATH = path.resolve(ROOT, 'app/api/guide/bookings/route.ts');
const DETAIL_ROUTE_PATH = path.resolve(ROOT, 'app/api/guide/bookings/[bookingId]/route.ts');
const PAGE_PATH = path.resolve(ROOT, 'app/guide/bookings/page.tsx');

// ─── Behaviour test helpers ───────────────────────────────────────────────────

/**
 * Extract extractGuideConflictOverride body from route source and execute as a
 * plain JS function — no TS, no imports, no auth/supabase required.
 * This directly validates the privacy-critical field-stripping logic.
 */
function buildExtractGuideConflictOverride() {
  const src = readFileSync(DETAIL_ROUTE_PATH, 'utf8');
  // Grab just the function body between the first { and matching }
  const match = src.match(/function extractGuideConflictOverride\(snapshot[^)]*\)\s*:\s*[^{]+\{([\s\S]*?)\n\}/);
  if (!match) throw new Error('extractGuideConflictOverride not found in source');
  // Strip TypeScript type annotations from body (: any, ?? null, etc. are fine as-is in JS)
  // The body uses only basic JS operations — safe to eval.
  const body = match[1];
  // eslint-disable-next-line no-new-func
  return new Function('snapshot', body);
}

const extractGuideConflictOverride = buildExtractGuideConflictOverride();

const MOCK_OVERRIDE_SNAPSHOT_WITH_HELPER = {
  overrideId: 'ovr-fff-0001',
  reason: 'VIP 客訴補救，核准開放此衝突時段',
  requiresHelper: true,
  helperStatus: 'required',
  guideNote: '導遊已知悉需協調半日衝突',
  adminNote: '後台主管核准 — 內部備注勿外露',   // must NOT appear in result
  startAt: '2030-04-12T09:00:00+08:00',
  endAt: '2030-04-12T12:00:00+08:00',
};

const MOCK_OVERRIDE_SNAPSHOT_NO_HELPER = {
  overrideId: 'ovr-ggg-0002',
  reason: '特殊活動申請',
  requiresHelper: false,
  helperStatus: null,
  guideNote: null,
  adminNote: '管理員內部核准備注',  // must NOT appear in result
  startAt: '2030-05-01T14:00:00+08:00',
  endAt: '2030-05-01T17:00:00+08:00',
};

// ─── GREEN: Source-contract tests ────────────────────────────────────────────

test('GH-1257 GREEN source-contract: detail route selects bookings join with conflict_override_snapshot', () => {
  const src = readFileSync(DETAIL_ROUTE_PATH, 'utf8');
  // After implementation these must exist
  assert.match(src, /conflict_override_snapshot/, 'Detail route must select conflict_override_snapshot');
  // The extractGuideConflictOverride helper must not forward snapshot.adminNote.
  // We check that the snapshot field is not accessed (snapshot.adminNote) within the helper.
  // Note: order.adminNote is a separate, legitimate order-level field; we only guard the snapshot field.
  assert.doesNotMatch(
    src,
    /snapshot\s*\.\s*adminNote/,
    'Detail route must not access snapshot.adminNote — guide-safe fields only from extractGuideConflictOverride',
  );
});

test('GH-1257 GREEN source-contract: list route selects bookings join for hasConflictOverride marker', () => {
  const src = readFileSync(LIST_ROUTE_PATH, 'utf8');
  assert.match(src, /conflict_override_snapshot|hasConflictOverride/, 'List route must carry conflict override marker');
});

test('GH-1257 GREEN source-contract: page renders 管理者例外開放 warning copy when conflictOverride present', () => {
  const src = readFileSync(PAGE_PATH, 'utf8');
  assert.match(src, /管理者例外開放/, 'Page must contain 管理者例外開放 warning label');
  assert.match(src, /時間衝突/, 'Page must contain 時間衝突 label');
  assert.match(src, /需要助手/, 'Page must contain 需要助手 label');
});

test('GH-1257 GREEN source-contract: page does NOT expose snapshot adminNote as a guide-visible field', () => {
  const src = readFileSync(PAGE_PATH, 'utf8');
  // The conflict override snapshot's adminNote must NOT be rendered in the guide-visible warning section.
  // The ConflictOverrideWarning component must not access override.adminNote.
  // We look for the specific pattern of accessing adminNote on the override prop.
  assert.doesNotMatch(
    src,
    /override\.adminNote/,
    'Page must not render override.adminNote — guide-safe fields only',
  );
  // Also must not forward adminNote in JSX text/value position
  assert.doesNotMatch(
    src,
    /\{[^}]*\.adminNote[^}]*\}.*(?:admin|內部)/,
    'Page must not render adminNote from conflict override snapshot to guide-visible UI',
  );
});

test('GH-1257 GREEN privacy: guide detail response mapping must not include adminNote from snapshot', () => {
  const src = readFileSync(DETAIL_ROUTE_PATH, 'utf8');
  // The response mapping should not forward snapshot.adminNote
  assert.doesNotMatch(
    src,
    /conflictOverride[^;{]*adminNote/,
    'Detail route must strip adminNote when building conflictOverride response object',
  );
});

// ─── GREEN: Behaviour tests for extractGuideConflictOverride ─────────────────

test('GH-1257 GREEN behaviour: requiresHelper=true snapshot returns guide-safe fields, no adminNote', () => {
  const result = extractGuideConflictOverride(MOCK_OVERRIDE_SNAPSHOT_WITH_HELPER);
  assert.ok(result !== null, 'Should return an object for a valid snapshot');
  assert.equal(typeof result, 'object');

  // Guide-safe fields must be present
  assert.equal(result.reason, 'VIP 客訴補救，核准開放此衝突時段', 'reason must be forwarded');
  assert.equal(result.requiresHelper, true, 'requiresHelper must be true');
  assert.equal(result.helperStatus, 'required', 'helperStatus must be forwarded');
  assert.equal(result.guideNote, '導遊已知悉需協調半日衝突', 'guideNote must be forwarded');
  assert.equal(result.startAt, '2030-04-12T09:00:00+08:00', 'startAt must be forwarded');
  assert.equal(result.endAt, '2030-04-12T12:00:00+08:00', 'endAt must be forwarded');

  // adminNote must be stripped
  assert.ok(!('adminNote' in result), 'adminNote must NOT be present in guide-visible result');
  assert.equal(result.adminNote, undefined, 'adminNote must be undefined — never forwarded to guide');
});

test('GH-1257 GREEN behaviour: requiresHelper=false snapshot returns requiresHelper:false, no adminNote', () => {
  const result = extractGuideConflictOverride(MOCK_OVERRIDE_SNAPSHOT_NO_HELPER);
  assert.ok(result !== null, 'Should return an object for a valid snapshot');

  assert.equal(result.requiresHelper, false, 'requiresHelper must be false — must not falsely claim helper needed');
  assert.equal(result.reason, '特殊活動申請', 'reason must be forwarded');
  assert.equal(result.helperStatus, null, 'helperStatus must be null when not required');
  assert.equal(result.guideNote, null, 'guideNote must be null when not set');

  // adminNote must be stripped
  assert.ok(!('adminNote' in result), 'adminNote must NOT be present when requiresHelper=false either');
});

test('GH-1257 GREEN behaviour: null snapshot returns null — no conflict override warning for normal bookings', () => {
  const resultNull = extractGuideConflictOverride(null);
  assert.equal(resultNull, null, 'null snapshot must return null');

  const resultUndefined = extractGuideConflictOverride(undefined);
  assert.equal(resultUndefined, null, 'undefined snapshot must return null');

  const resultNonObject = extractGuideConflictOverride('not-an-object');
  assert.equal(resultNonObject, null, 'non-object snapshot must return null');
});

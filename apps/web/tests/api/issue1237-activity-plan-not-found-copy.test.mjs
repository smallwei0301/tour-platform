// Issue #1237 acceptance criterion 4 — "UI error copy for this seam is
// user-friendly; avoid exposing raw `Activity plan not found` to
// travelers if data is invalid." These tests pin the new shared helper
// plus the two route integrations.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildActivityPlanNotFoundResponse,
  ACTIVITY_PLAN_NOT_FOUND_REASONS,
} from '../../src/lib/availability-v2/activity-plan-not-found-copy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const AVAIL_SLOTS_PATH = join(REPO_ROOT, 'app/api/v2/activities/[activityId]/available-slots/route-handler.ts');
const DRAFT_ROUTE_PATH = join(REPO_ROOT, 'app/api/v2/bookings/draft/route.ts');

// ---------- helper unit ----------

test('PLAN_NOT_FOUND returns 404 + actionable zh-TW message about re-selecting a plan', () => {
  const r = buildActivityPlanNotFoundResponse('PLAN_NOT_FOUND');
  assert.equal(r.status, 404);
  assert.equal(r.body.success, false);
  assert.equal(r.body.error.code, 'NOT_FOUND');
  assert.equal(r.body.error.message, 'Activity plan not found');
  assert.match(r.body.error.messageZh, /找不到此方案/);
  assert.match(r.body.error.messageZh, /重新選擇方案/);
});

test('PLAN_NOT_ACTIVE returns 404 + actionable zh-TW message about choosing a different plan', () => {
  const r = buildActivityPlanNotFoundResponse('PLAN_NOT_ACTIVE');
  assert.equal(r.status, 404);
  assert.equal(r.body.error.message, 'Activity plan is not active');
  assert.match(r.body.error.messageZh, /未開放預約/);
  assert.match(r.body.error.messageZh, /選擇其他方案/);
});

test('Unknown reason / null falls back to PLAN_NOT_FOUND copy (safe default)', () => {
  assert.equal(
    buildActivityPlanNotFoundResponse('made_up').body.error.messageZh,
    buildActivityPlanNotFoundResponse('PLAN_NOT_FOUND').body.error.messageZh,
  );
  assert.equal(
    buildActivityPlanNotFoundResponse(null).body.error.messageZh,
    buildActivityPlanNotFoundResponse('PLAN_NOT_FOUND').body.error.messageZh,
  );
  assert.equal(
    buildActivityPlanNotFoundResponse(undefined).body.error.messageZh,
    buildActivityPlanNotFoundResponse('PLAN_NOT_FOUND').body.error.messageZh,
  );
});

test('Every reason in ACTIVITY_PLAN_NOT_FOUND_REASONS produces non-empty en + zh', () => {
  for (const reason of ACTIVITY_PLAN_NOT_FOUND_REASONS) {
    const r = buildActivityPlanNotFoundResponse(reason);
    assert.ok(r.body.error.message.length > 0, `${reason}: message must be non-empty`);
    assert.ok(r.body.error.messageZh.length > 0, `${reason}: messageZh must be non-empty`);
    assert.match(r.body.error.messageZh, /[一-鿿]/, `${reason}: messageZh must contain zh-Hant`);
  }
});

test('Returned envelope never carries raw English in messageZh field (#1237 regression guard)', () => {
  for (const reason of ACTIVITY_PLAN_NOT_FOUND_REASONS) {
    const { messageZh } = buildActivityPlanNotFoundResponse(reason).body.error;
    assert.doesNotMatch(messageZh, /Activity plan/i,
      `${reason}: messageZh must not echo the English string`);
  }
});

// ---------- source contract: available-slots route uses the helper ----------

test('Available-slots route imports buildActivityPlanNotFoundResponse', () => {
  const src = readFileSync(AVAIL_SLOTS_PATH, 'utf8');
  assert.match(
    src,
    /from\s+['"][^'"]*activity-plan-not-found-copy(\.mjs)?['"]/,
    'available-slots route must import the not-found helper',
  );
  assert.match(src, /buildActivityPlanNotFoundResponse/);
});

test('Available-slots route no longer returns inline errorV2(NOT_FOUND, "Activity plan not found")', () => {
  const src = readFileSync(AVAIL_SLOTS_PATH, 'utf8');
  // The literal English strings must be gone from this route — the
  // helper is the only source of truth now.
  assert.doesNotMatch(src, /errorV2\(\s*['"]NOT_FOUND['"]\s*,\s*['"]Activity plan not found['"]/);
  assert.doesNotMatch(src, /errorV2\(\s*['"]NOT_FOUND['"]\s*,\s*['"]Activity plan is not active['"]/);
});

// ---------- source contract: draft route uses the helper ----------

test('Draft route imports buildActivityPlanNotFoundResponse', () => {
  const src = readFileSync(DRAFT_ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /from\s+['"][^'"]*activity-plan-not-found-copy(\.mjs)?['"]/,
    'draft route must import the not-found helper',
  );
  assert.match(src, /buildActivityPlanNotFoundResponse/);
});

test('Draft route no longer returns inline errorV2(NOT_FOUND, "Activity plan not found / is not active")', () => {
  const src = readFileSync(DRAFT_ROUTE_PATH, 'utf8');
  assert.doesNotMatch(src, /errorV2\(\s*['"]NOT_FOUND['"]\s*,\s*['"]Activity plan not found['"]/);
  assert.doesNotMatch(src, /errorV2\(\s*['"]NOT_FOUND['"]\s*,\s*['"]Activity plan is not active['"]/);
});

// ---------- source contract: helper file has no PII columns ----------

test('Helper file does NOT reference traveler PII column names', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'src/lib/availability-v2/activity-plan-not-found-copy.mjs'),
    'utf8',
  );
  assert.doesNotMatch(src, /\bcontact_email\b/);
  assert.doesNotMatch(src, /\btraveler_email\b/);
  assert.doesNotMatch(src, /\bcontact_phone\b/);
  assert.doesNotMatch(src, /\bpayment_payload\b/);
});

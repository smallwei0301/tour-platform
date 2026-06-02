// Issue #1079 Section B — POST /api/v2/admin/activities/:activityId/schedules
// with strict planId validation. This file pins:
//   - the resolveAdminSchedulePlan pure helper behavior
//   - the route file's wiring (import order, error codes, 422 status)
// The legacy /api/admin/activities/[id]/schedules route returns ok=true when
// the plan is not found (db.mjs#validateScheduleCapacityAgainstPlan line 3454),
// so this V2 endpoint must reject early.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveAdminSchedulePlan } from '../../src/lib/availability-v2/admin-schedule-plan-resolver.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ROUTE_PATH = join(
  REPO_ROOT,
  'app/api/v2/admin/activities/[activityId]/schedules/route.ts',
);

const ACTIVITY_ID = '11111111-1111-1111-1111-111111111111';
const PLAN_A = { id: 'aaaa1111-1111-1111-1111-111111111111', activity_id: ACTIVITY_ID, status: 'active' };
const PLAN_B = { id: 'bbbb2222-2222-2222-2222-222222222222', activity_id: ACTIVITY_ID, status: 'active' };
const PLAN_FOREIGN = { id: 'cccc3333-3333-3333-3333-333333333333', activity_id: 'other-activity', status: 'active' };

test('resolveAdminSchedulePlan: explicit planId matching active plan on this activity → ok', () => {
  const r = resolveAdminSchedulePlan({
    requestedPlanId: PLAN_A.id,
    activityId: ACTIVITY_ID,
    activePlans: [PLAN_A, PLAN_B],
  });
  assert.deepEqual(r, { ok: true, planId: PLAN_A.id });
});

test('resolveAdminSchedulePlan: explicit planId not in active plans → PLAN_NOT_ACTIVE', () => {
  const r = resolveAdminSchedulePlan({
    requestedPlanId: 'dddd4444-4444-4444-4444-444444444444',
    activityId: ACTIVITY_ID,
    activePlans: [PLAN_A],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PLAN_NOT_ACTIVE');
  assert.match(r.messageZh, /方案管理啟用/);
});

test('resolveAdminSchedulePlan: planId found but belongs to a different activity → WRONG_ACTIVITY_PLAN', () => {
  const r = resolveAdminSchedulePlan({
    requestedPlanId: PLAN_FOREIGN.id,
    activityId: ACTIVITY_ID,
    activePlans: [PLAN_FOREIGN],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'WRONG_ACTIVITY_PLAN');
  assert.match(r.messageZh, /不屬於此活動/);
});

test('resolveAdminSchedulePlan: null planId + exactly 1 active plan → auto-resolves to that plan', () => {
  const r = resolveAdminSchedulePlan({
    requestedPlanId: null,
    activityId: ACTIVITY_ID,
    activePlans: [PLAN_A],
  });
  assert.deepEqual(r, { ok: true, planId: PLAN_A.id });
});

test('resolveAdminSchedulePlan: null planId + 0 active plans → AMBIGUOUS_PLAN', () => {
  const r = resolveAdminSchedulePlan({
    requestedPlanId: null,
    activityId: ACTIVITY_ID,
    activePlans: [],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'AMBIGUOUS_PLAN');
  assert.match(r.messageZh, /建立並啟用方案/);
});

test('resolveAdminSchedulePlan: null planId + 2 active plans → AMBIGUOUS_PLAN with count in message', () => {
  const r = resolveAdminSchedulePlan({
    requestedPlanId: null,
    activityId: ACTIVITY_ID,
    activePlans: [PLAN_A, PLAN_B],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'AMBIGUOUS_PLAN');
  assert.match(r.messageZh, /2 個啟用中的方案/);
});

test('resolveAdminSchedulePlan: undefined planId treated as null (auto-resolve when exactly one)', () => {
  const r = resolveAdminSchedulePlan({
    requestedPlanId: undefined,
    activityId: ACTIVITY_ID,
    activePlans: [PLAN_A],
  });
  assert.deepEqual(r, { ok: true, planId: PLAN_A.id });
});

test('resolveAdminSchedulePlan: empty string planId treated as null', () => {
  const r = resolveAdminSchedulePlan({
    requestedPlanId: '',
    activityId: ACTIVITY_ID,
    activePlans: [PLAN_A],
  });
  assert.deepEqual(r, { ok: true, planId: PLAN_A.id });
});

test('resolveAdminSchedulePlan: activePlans null / non-array safely treated as empty', () => {
  assert.equal(
    resolveAdminSchedulePlan({ requestedPlanId: null, activityId: ACTIVITY_ID, activePlans: null }).code,
    'AMBIGUOUS_PLAN',
  );
  assert.equal(
    resolveAdminSchedulePlan({ requestedPlanId: PLAN_A.id, activityId: ACTIVITY_ID, activePlans: null }).code,
    'PLAN_NOT_ACTIVE',
  );
});

test('Source contract: V2 admin schedules route file exists at the expected path', () => {
  assert.ok(
    existsSync(ROUTE_PATH),
    `expected new route at app/api/v2/admin/activities/[activityId]/schedules/route.ts`,
  );
});

test('Source contract: route imports the plan resolver and createScheduleDb', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /from\s+['"][^'"]*admin-schedule-plan-resolver(\.mjs)?['"]/,
    'route should import admin-schedule-plan-resolver',
  );
  assert.match(src, /resolveAdminSchedulePlan/);
  assert.match(src, /createScheduleDb/);
});

test('Source contract: route exports POST and uses errorV2 + 422 for plan validation failures', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /export\s+async\s+function\s+POST/);
  // Plan validation rejection path: errorV2(code, message) with status 422.
  const resolveCall = src.indexOf('resolveAdminSchedulePlan(');
  assert.ok(resolveCall > 0, 'route should call resolveAdminSchedulePlan');
  const block = src.slice(resolveCall, resolveCall + 800);
  assert.match(block, /status:\s*422/, 'plan validation failures should return HTTP 422');
});

test('Source contract: route fetches activity_plans pre-filtered to status=active', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // Pre-filtering by status='active' is required so the resolver sees only
  // active plans (matches helper contract).
  assert.match(src, /from\(['"]activity_plans['"]\)/);
  assert.match(src, /\.eq\(['"]status['"]\s*,\s*['"]active['"]\)/);
  assert.match(src, /\.eq\(['"]activity_id['"]/);
});

test('Source contract: route success response uses successV2 with status 201', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /successV2\(/);
  assert.match(src, /status:\s*201/);
});

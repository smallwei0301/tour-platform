/**
 * Issue #1178 — Schedule modal resolver: gate by active V2 plan count (AC4)
 *
 * Source-contract tests for resolveAdminSchedulePlan() in
 * src/lib/availability-v2/admin-schedule-plan-resolver.mjs.
 *
 * AC4 contract:
 *   - 0 active plans → { ok: false, code: 'AMBIGUOUS_PLAN' }
 *   - 1 active plan + no planId → { ok: true, planId: <that plan's id> }
 *   - ≥2 active plans + null planId → { ok: false, code: 'AMBIGUOUS_PLAN' }
 *   - ≥2 active plans + explicit planId → { ok: true, planId: <that id> }
 *   - planId not in activePlans → { ok: false, code: 'PLAN_NOT_ACTIVE' }
 *   - planId belongs to wrong activity → { ok: false, code: 'WRONG_ACTIVITY_PLAN' }
 *
 * UI contract (verified via source-contract regex):
 *   - 0 active plans: modal renders blocking copy containing '此活動沒有可用的 V2 方案'
 *   - 0 active plans: submit button disabled (availablePlans.length === 0 guard)
 *   - 1 active plan: no '全部方案' option rendered
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveAdminSchedulePlan } from '../../src/lib/availability-v2/admin-schedule-plan-resolver.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const ACTIVITY_A = 'aaaa0000-0000-0000-0000-000000001178';
const PLAN_1 = { id: 'plan-uuid-0001', activity_id: ACTIVITY_A, status: 'active', name: '早鳥半日探秘' };
const PLAN_2 = { id: 'plan-uuid-0002', activity_id: ACTIVITY_A, status: 'active', name: '全日深度探秘' };

// ── Resolver unit tests ──────────────────────────────────────────────────────

test('AC4.1 — 0 active plans + no planId → AMBIGUOUS_PLAN (no plans available)', () => {
  const result = resolveAdminSchedulePlan({
    requestedPlanId: null,
    activityId: ACTIVITY_A,
    activePlans: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AMBIGUOUS_PLAN');
  assert.match(result.messageZh, /沒有可用的 V2 方案/);
});

test('AC4.2 — 1 active plan + no planId → ok: true, auto-resolves plan', () => {
  const result = resolveAdminSchedulePlan({
    requestedPlanId: null,
    activityId: ACTIVITY_A,
    activePlans: [PLAN_1],
  });
  assert.equal(result.ok, true);
  assert.equal(result.planId, PLAN_1.id);
});

test('AC4.3 — 2 active plans + null planId → AMBIGUOUS_PLAN (explicit selection required)', () => {
  const result = resolveAdminSchedulePlan({
    requestedPlanId: null,
    activityId: ACTIVITY_A,
    activePlans: [PLAN_1, PLAN_2],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AMBIGUOUS_PLAN');
  assert.match(result.messageZh, /2 個啟用中的方案/);
});

test('AC4.4 — 2 active plans + explicit planId → ok: true', () => {
  const result = resolveAdminSchedulePlan({
    requestedPlanId: PLAN_1.id,
    activityId: ACTIVITY_A,
    activePlans: [PLAN_1, PLAN_2],
  });
  assert.equal(result.ok, true);
  assert.equal(result.planId, PLAN_1.id);
});

test('AC4.5 — planId not in activePlans → PLAN_NOT_ACTIVE', () => {
  const result = resolveAdminSchedulePlan({
    requestedPlanId: 'plan-unknown-uuid',
    activityId: ACTIVITY_A,
    activePlans: [PLAN_1],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PLAN_NOT_ACTIVE');
});

test('AC4.6 — planId belongs to wrong activity → WRONG_ACTIVITY_PLAN', () => {
  const wrongActivityPlan = { ...PLAN_1, activity_id: 'other-activity-uuid' };
  const result = resolveAdminSchedulePlan({
    requestedPlanId: PLAN_1.id,
    activityId: ACTIVITY_A,
    activePlans: [wrongActivityPlan],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRONG_ACTIVITY_PLAN');
});

test('AC4.7 — empty-string planId treated as no-planId (ambiguous when 2 plans)', () => {
  const result = resolveAdminSchedulePlan({
    requestedPlanId: '',
    activityId: ACTIVITY_A,
    activePlans: [PLAN_1, PLAN_2],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AMBIGUOUS_PLAN');
});

test('AC4.8 — activePlans contains null entries (defensive filter)', () => {
  const result = resolveAdminSchedulePlan({
    requestedPlanId: null,
    activityId: ACTIVITY_A,
    activePlans: [null, PLAN_1, null],
  });
  // Nulls filtered; 1 valid plan → auto-resolve
  assert.equal(result.ok, true);
  assert.equal(result.planId, PLAN_1.id);
});

// ── Source-contract: UI component renders blocking message for 0-plan case ──

test('Source contract: AddScheduleModal guards 0-plan case with blocking message copy', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'src/components/admin/activity-form/ScheduleSection.tsx'),  // #1615 拆檔：AddScheduleModal 移至 ScheduleSection
    'utf8',
  );
  // Must contain the blocking copy text required by AC1
  assert.match(
    src,
    /此活動沒有可用的 V2 方案/,
    'Modal must render blocking copy when 0 active plans (此活動沒有可用的 V2 方案)',
  );
});

test('Source contract: AddScheduleModal disables submit when 0 active plans', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'src/components/admin/activity-form/ScheduleSection.tsx'),  // #1615 拆檔：AddScheduleModal 移至 ScheduleSection
    'utf8',
  );
  // Submit must be disabled when availablePlans.length === 0
  assert.match(
    src,
    /availablePlans\.length\s*===\s*0/,
    'Submit button must check availablePlans.length === 0 to disable',
  );
});

test('Source contract: 全部方案 option is NOT shown for 0-plan case (old < 2 bug gone)', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'src/components/admin/activity-form/ScheduleSection.tsx'),  // #1615 拆檔：AddScheduleModal 移至 ScheduleSection
    'utf8',
  );
  // Old bug: rendered 全部方案 when availablePlans.length < 2 (which includes 0 plans).
  // The fix must NOT use the "< 2" pattern to gate 全部方案.
  const hasOldBugPattern = /availablePlans\.length\s*<\s*2/.test(src);
  if (hasOldBugPattern) {
    // Check if 全部方案 is still paired with the < 2 guard
    const bugIdx = src.indexOf('availablePlans.length < 2');
    const snippet = src.slice(Math.max(0, bugIdx - 10), bugIdx + 200);
    if (snippet.includes('全部方案')) {
      assert.fail(
        'Bug still present: 全部方案 is rendered when availablePlans.length < 2 (includes 0-plan case). ' +
        'Fix: gate with === 1, or remove the option and show plan name + blocking message instead.',
      );
    }
  }
  // If we get here, the old bug pattern is either gone or decoupled from 全部方案.
  // Additionally verify blocking copy is present (redundant check, but belt-and-suspenders).
  assert.match(src, /此活動沒有可用的 V2 方案/);
});

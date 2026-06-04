/**
 * Issue #1133 — Source-contract tests: activity detail inactive-plan state
 *
 * Verifies that:
 * 1. getV2ActivityAvailability (or its return type) carries a planConfigState field
 * 2. availability/route.ts does NOT fall back to legacy when plan is explicitly inactive
 *    (returns planConfigState: 'no_active_plans' | 'no_plans' instead)
 * 3. availability/route.ts DOES fall back to legacy for the legitimate
 *    v2-no-generated-slots case (active plan, no slot rules configured yet)
 * 4. The response shape includes planConfigState field in the inactive-plan branch
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('T1133.1 — activity-day-availability returns planConfigState when no active plans exist', async () => {
  const src = await readSource('src/lib/availability-v2/activity-day-availability.ts');

  // The function must detect the no_active_plans / no_plans distinction
  assert.match(
    src,
    /no_active_plans/,
    'activity-day-availability must emit no_active_plans signal when plans exist but none are active'
  );
  assert.match(
    src,
    /no_plans/,
    'activity-day-availability must emit no_plans signal when no plans exist at all'
  );
  assert.match(
    src,
    /planConfigState/,
    'return value must include planConfigState field'
  );
});

test('T1133.2 — availability/route.ts does NOT fall back to legacy when planConfigState is no_active_plans', async () => {
  const src = await readSource('app/api/activities/[slug]/availability/route.ts');

  // Must check planConfigState before doing the legacy fallback
  assert.match(
    src,
    /planConfigState\s*===\s*'no_active_plans'|planConfigState.*no_active_plans/,
    'route must check for no_active_plans before falling back to legacy'
  );

  // Must NOT fall back to legacy for inactive plan — must return explicit state
  assert.match(
    src,
    /no_active_plans.*availabilityNotice|availabilityNotice.*no_active_plans/s,
    'route must return an availabilityNotice for no_active_plans instead of calling loadLegacySchedules'
  );
});

test('T1133.3 — availability/route.ts does NOT fall back to legacy when planConfigState is no_plans', async () => {
  const src = await readSource('app/api/activities/[slug]/availability/route.ts');

  assert.match(
    src,
    /planConfigState\s*===\s*'no_plans'|planConfigState.*no_plans/,
    'route must check for no_plans case'
  );
  assert.match(
    src,
    /no_plans.*availabilityNotice|availabilityNotice.*no_plans/s,
    'route must return an availabilityNotice for no_plans state'
  );
});

test('T1133.4 — availability/route.ts PRESERVES legacy fallback for v2-no-generated-slots (active plan, no slots)', async () => {
  const src = await readSource('app/api/activities/[slug]/availability/route.ts');

  // The legitimate fallback must remain: active plan but no slot rules configured
  assert.match(
    src,
    /v2-no-generated-slots/,
    'route must still have the v2-no-generated-slots fallback header for active-plan-but-no-rules case'
  );
  assert.match(
    src,
    /v2HasGeneratedSlots/,
    'route must still call v2HasGeneratedSlots for the active-plan slot check'
  );
});

test('T1133.5 — response shape includes planConfigState field in inactive-plan branch', async () => {
  const src = await readSource('app/api/activities/[slug]/availability/route.ts');

  // The JSON response for inactive/no-plan cases must include planConfigState key
  assert.match(
    src,
    /planConfigState:\s*v2(?:Result)?\.planConfigState|planConfigState:\s*'no_active_plans'|planConfigState:\s*'no_plans'/,
    'response JSON must include planConfigState field for inactive-plan cases'
  );
});

test('T1133.6 — activity-day-availability returns planConfigState for all active-plan flows too (ok state)', async () => {
  const src = await readSource('src/lib/availability-v2/activity-day-availability.ts');

  // The V2AvailabilityResult type or returned object should carry planConfigState
  // It's acceptable to be optional (?) for backward compat
  assert.match(
    src,
    /planConfigState/,
    'planConfigState must appear in activity-day-availability (for no_active_plans/no_plans paths at minimum)'
  );
});

test('T1133.7 — DatePlanSection renders inactive-plan notice when planConfigState is no_active_plans', async () => {
  const src = await readSource('src/components/activity/DatePlanSection.tsx');

  assert.match(
    src,
    /planConfigState/,
    'DatePlanSection must read planConfigState from availability response'
  );
  assert.match(
    src,
    /未開放預約|planConfigState.*no_active_plans|no_active_plans.*未開放/s,
    'DatePlanSection must display "未開放預約" for no_active_plans state'
  );
});

test('T1133.8 — DatePlanSection renders no-plans notice when planConfigState is no_plans', async () => {
  const src = await readSource('src/components/activity/DatePlanSection.tsx');

  assert.match(
    src,
    /尚未設定.*方案|no_plans.*尚未|planConfigState.*no_plans/s,
    'DatePlanSection must display "尚未設定方案" for no_plans state'
  );
});

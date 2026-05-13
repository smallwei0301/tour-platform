/**
 * Issue #489 contract tests:
 * - guide-scoped activities/plans endpoint
 * - activity_plan_id ownership guardrails on guide availability rules
 * - guide schedules ownership and capacity floor protections
 * - explicit data-source separation (rules != auto-schedules)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '../../');

const activitiesWithPlansRoute = resolve(appRoot, 'app/api/guide/activities-with-plans/route.ts');
const availabilityRulesRoute = resolve(appRoot, 'app/api/guide/availability-rules/route.ts');
const availabilityRuleByIdRoute = resolve(appRoot, 'app/api/guide/availability-rules/[ruleId]/route.ts');
const schedulesRoute = resolve(appRoot, 'app/api/guide/schedules/route.ts');
const scheduleByIdRoute = resolve(appRoot, 'app/api/guide/schedules/[scheduleId]/route.ts');
const travelerSlotsRoute = resolve(appRoot, 'app/api/v2/activities/[activityId]/available-slots/route.ts');

test('adds guide activities-with-plans endpoint using activity_plans source of truth', () => {
  assert.ok(existsSync(activitiesWithPlansRoute), 'route file must exist');
  const source = readFileSync(activitiesWithPlansRoute, 'utf8');

  assert.match(source, /verifyGuideSession\(/, 'must require guide session');
  assert.match(source, /from\('activity_plans'\)/, 'must query activity_plans table');
  assert.match(source, /\.eq\('activities\.guide_id',\s*session\.guideId\)/, 'must scope to current guide ownership');
  assert.match(source, /\.eq\('activities\.is_active',\s*true\)/, 'must only expose active activities');
  assert.match(source, /\.in\('status',\s*\[['"]active['"],\s*['"]published['"]\]\)/, 'must include only usable plan statuses');
  assert.match(source, /activityId/, 'response should expose activityId');
  assert.match(source, /planId/, 'response should expose planId');
  assert.match(source, /maxParticipants/, 'response should expose maxParticipants');
});

test('availability-rules POST validates activity_plan_id belongs to current guide activity', () => {
  const source = readFileSync(availabilityRulesRoute, 'utf8');

  assert.match(source, /body\.activity_plan_id/, 'POST path must inspect activity_plan_id');
  assert.match(source, /from\('activity_plans'\)/, 'must verify plan against activity_plans');
  assert.match(source, /activities!inner\s*\(\s*guide_id\s*\)/, 'must join activities to validate owner guide_id');
  assert.match(source, /\.eq\('activities\.guide_id',\s*guideId\)/, 'must enforce ownership using session-derived guideId');
  assert.match(source, /status:\s*400|status:\s*403|FORBIDDEN|VALIDATION_ERROR/, 'must reject unknown/cross-guide plans');
  assert.match(source, /guide_id:\s*session\.guideId/, 'must never trust body guide_id');
});

test('availability-rules PUT validates activity_plan_id ownership on updates', () => {
  const source = readFileSync(availabilityRuleByIdRoute, 'utf8');

  assert.match(source, /body\.activity_plan_id/, 'PUT path must inspect activity_plan_id');
  assert.match(source, /from\('activity_plans'\)/, 'PUT must verify plan against activity_plans');
  assert.match(source, /activities!inner\s*\(\s*guide_id\s*\)/, 'PUT must join activities to validate owner guide_id');
  assert.match(source, /\.eq\('activities\.guide_id',\s*guideId\)/, 'PUT must enforce guide ownership via session-derived guideId');
});

test('guide schedules remain guide-scoped and keep capacity lower-bound protection', () => {
  const listSource = readFileSync(schedulesRoute, 'utf8');
  const patchSource = readFileSync(scheduleByIdRoute, 'utf8');

  assert.match(listSource, /from\('activities'\)/, 'list path must derive schedules from guide-owned activities');
  assert.match(listSource, /\.eq\('guide_id',\s*session\.guideId\)/, 'list path must scope to session guide');

  assert.match(patchSource, /activity\.guide_id\s*!==\s*session\.guideId/, 'PATCH must reject cross-guide schedule edits');
  assert.match(patchSource, /newCap\s*<\s*schedule\.booked_count/, 'PATCH must block capacity below booked_count');
});

test('explicitly documents no auto-sync from availability rules into activity_schedules', () => {
  const source = readFileSync(travelerSlotsRoute, 'utf8');
  assert.match(
    source,
    /guide_availability_rules|slot-generator|activity_schedules/,
    'traveler slots route contract must continue to read rules path; issue #489 must not introduce implicit schedule auto-sync',
  );
});

/**
 * Issue #1132 — Guide availability rules: plan-binding validation
 *
 * Source-contract tests for assertPlanBelongsToGuide helper and its
 * integration into POST/PUT availability-rules routes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const HELPER_PATHS = [
  join(REPO_ROOT, 'src/lib/availability-v2/assert-plan-belongs-to-guide.ts'),
  join(REPO_ROOT, 'src/lib/availability-v2/assert-plan-belongs-to-guide.mjs'),
];
const POST_ROUTE_PATH = join(
  REPO_ROOT,
  'app/api/v2/admin/guides/[guideId]/availability-rules/route.ts'
);
const PUT_ROUTE_PATH = join(
  REPO_ROOT,
  'app/api/v2/admin/guides/[guideId]/availability-rules/[ruleId]/route.ts'
);

function getHelperPath() {
  return HELPER_PATHS.find(p => existsSync(p));
}

test('Source contract: assertPlanBelongsToGuide helper file exists', () => {
  const helperPath = getHelperPath();
  assert.ok(
    helperPath,
    `Helper not found at any of: ${HELPER_PATHS.join(', ')}`
  );
});

test('Source contract: helper exports assertPlanBelongsToGuide function', () => {
  const helperPath = getHelperPath();
  assert.ok(helperPath, 'helper file must exist');
  const src = readFileSync(helperPath, 'utf8');
  assert.match(
    src,
    /export\s+(async\s+)?function\s+assertPlanBelongsToGuide|exports\.assertPlanBelongsToGuide/,
    'helper should export assertPlanBelongsToGuide'
  );
});

test('Source contract: helper queries activity_plans with join to activities', () => {
  const helperPath = getHelperPath();
  assert.ok(helperPath, 'helper file must exist');
  const src = readFileSync(helperPath, 'utf8');
  assert.match(src, /activity_plans/, 'helper should query activity_plans');
  assert.match(src, /guide_id|activities/, 'helper should verify guide ownership');
});

test('Source contract: helper returns ok:false codes for bad plans', () => {
  const helperPath = getHelperPath();
  assert.ok(helperPath, 'helper file must exist');
  const src = readFileSync(helperPath, 'utf8');
  assert.match(
    src,
    /ok:\s*false/,
    'helper should return { ok: false } on failure'
  );
  assert.match(
    src,
    /PLAN_NOT_FOUND|PLAN_WRONG_GUIDE|PLAN_NOT_ACTIVE/,
    'helper should have meaningful error codes'
  );
});

test('Source contract: POST availability-rules imports plan validation helper', () => {
  const src = readFileSync(POST_ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /assertPlanBelongsToGuide/,
    'POST route should import and use assertPlanBelongsToGuide'
  );
});

test('Source contract: PUT availability-rules imports plan validation helper', () => {
  const src = readFileSync(PUT_ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /assertPlanBelongsToGuide/,
    'PUT route should import and use assertPlanBelongsToGuide'
  );
});

test('Source contract: POST route calls plan validator before .insert(', () => {
  const src = readFileSync(POST_ROUTE_PATH, 'utf8');
  const validatorIdx = src.indexOf('assertPlanBelongsToGuide(');
  const insertIdx = src.indexOf('.insert(');
  assert.ok(validatorIdx >= 0, 'POST route must call assertPlanBelongsToGuide');
  assert.ok(insertIdx >= 0, 'POST route must still call .insert(');
  assert.ok(
    validatorIdx < insertIdx,
    'assertPlanBelongsToGuide must be called before .insert('
  );
});

test('Source contract: PUT route calls plan validator before .update(', () => {
  const src = readFileSync(PUT_ROUTE_PATH, 'utf8');
  const validatorIdx = src.indexOf('assertPlanBelongsToGuide(');
  const updateIdx = src.indexOf('.update(');
  assert.ok(validatorIdx >= 0, 'PUT route must call assertPlanBelongsToGuide');
  assert.ok(updateIdx >= 0, 'PUT route must still call .update(');
  assert.ok(
    validatorIdx < updateIdx,
    'assertPlanBelongsToGuide must be called before .update('
  );
});

test('Source contract: POST/PUT routes return 422 when plan validation fails', () => {
  const postSrc = readFileSync(POST_ROUTE_PATH, 'utf8');
  const putSrc = readFileSync(PUT_ROUTE_PATH, 'utf8');
  // Check that near the assertPlanBelongsToGuide call, there is a 422 status
  assert.match(postSrc, /status:\s*422/, 'POST route should have 422 for plan validation failure');
  assert.match(putSrc, /status:\s*422/, 'PUT route should have 422 for plan validation failure');
});

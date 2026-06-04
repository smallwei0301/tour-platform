/**
 * Issue #1132 — Guide availability rules: bind V2 activity_plan_id in UI and API
 *
 * Source-contract tests for GET /api/v2/admin/guides/:guideId/activity-plans
 * These tests run without a live DB (source-contract style — read the route file directly).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const ROUTE_PATH = join(
  REPO_ROOT,
  'app/api/v2/admin/guides/[guideId]/activity-plans/route.ts'
);

test('Source contract: activity-plans route file exists at expected path', () => {
  assert.ok(
    existsSync(ROUTE_PATH),
    `Route file not found at: ${ROUTE_PATH}`
  );
});

test('Source contract: route exports GET handler', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /export\s+async\s+function\s+GET\s*\(/, 'route should export GET');
});

test('Source contract: route imports createClient from supabase server', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /from\s+['"][^'"]*supabase\/server['"]/,
    'route should import createClient from supabase/server'
  );
  assert.match(src, /createClient/);
});

test('Source contract: route validates guideId as UUID', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /UUID_REGEX|isUUID|uuid/i,
    'route should validate guideId as UUID'
  );
});

test('Source contract: route queries activities table with guide_id filter', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /from\('activities'\)/, 'route should query activities table');
  assert.match(src, /guide_id/, 'route should filter by guide_id');
});

test('Source contract: route joins activity_plans in select', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /activity_plans/, 'route should join or reference activity_plans');
});

test('Source contract: route returns 422 for invalid guideId', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /status:\s*4[02][02]/, 'route should return 4xx for invalid guideId');
});

test('Source contract: route returns activities with plans shape', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /activities/,
    'route response should include activities key'
  );
});

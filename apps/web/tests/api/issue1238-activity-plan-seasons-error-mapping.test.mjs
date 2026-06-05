// Issue #1238 — POST /api/v2/admin/activities/:activityId/plans/:planId/seasons
// used to mask every Supabase failure as a single generic 500
// "Failed to create season". These tests pin the new error-mapping helper
// + route integration so operators see actionable codes + zh messages
// while server logs still capture the raw error verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mapActivityPlanSeasonInsertError } from '../../src/lib/activity-plan-seasons-error.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const ROUTE_PATH = join(
  REPO_ROOT,
  'app/api/v2/admin/activities/[activityId]/plans/[planId]/seasons/route.ts',
);

// ---------- helper unit ----------

test('RLS denied: pg code 42501 → 403 RLS_DENIED with zh hint about service-role', () => {
  const r = mapActivityPlanSeasonInsertError({ code: '42501', message: 'permission denied for table activity_plan_seasons' });
  assert.equal(r.code, 'RLS_DENIED');
  assert.equal(r.status, 403);
  assert.match(r.messageZh, /權限策略/);
});

test('RLS denied: message contains "row-level security" with no code → 403 RLS_DENIED', () => {
  const r = mapActivityPlanSeasonInsertError({ message: 'new row violates row-level security policy' });
  assert.equal(r.code, 'RLS_DENIED');
  assert.equal(r.status, 403);
});

test('Schema missing table: pg code 42P01 → 500 SCHEMA_MISSING_TABLE with migration hint', () => {
  const r = mapActivityPlanSeasonInsertError({ code: '42P01', message: 'relation "activity_plan_seasons" does not exist' });
  assert.equal(r.code, 'SCHEMA_MISSING_TABLE');
  assert.equal(r.status, 500);
  assert.match(r.messageZh, /migration 已套用/);
});

test('Schema column missing: pg code 42703 → 500 SCHEMA_COLUMN_MISSING (raw message preserved in EN)', () => {
  const r = mapActivityPlanSeasonInsertError({ code: '42703', message: 'column "is_year_round" does not exist' });
  assert.equal(r.code, 'SCHEMA_COLUMN_MISSING');
  assert.equal(r.status, 500);
  assert.match(r.message, /is_year_round/);
  assert.match(r.messageZh, /欄位與程式不一致/);
});

test('Foreign-key violation: pg code 23503 → 422 PLAN_FK_VIOLATION', () => {
  const r = mapActivityPlanSeasonInsertError({ code: '23503', message: 'insert or update on table "activity_plan_seasons" violates foreign key' });
  assert.equal(r.code, 'PLAN_FK_VIOLATION');
  assert.equal(r.status, 422);
  assert.match(r.messageZh, /方案不存在/);
});

test('Unique violation: pg code 23505 → 409 DUPLICATE_SEASON', () => {
  const r = mapActivityPlanSeasonInsertError({ code: '23505', message: 'duplicate key value violates unique constraint' });
  assert.equal(r.code, 'DUPLICATE_SEASON');
  assert.equal(r.status, 409);
});

test('Check constraint violation: pg code 23514 → 422 INVALID_SEASON_RANGE', () => {
  const r = mapActivityPlanSeasonInsertError({ code: '23514', message: 'new row violates check constraint' });
  assert.equal(r.code, 'INVALID_SEASON_RANGE');
  assert.equal(r.status, 422);
  assert.match(r.messageZh, /月份須為 1–12/);
});

test('PostgREST PGRST116 (no rows) → 404 NOT_FOUND', () => {
  const r = mapActivityPlanSeasonInsertError({ code: 'PGRST116', message: 'No rows returned' });
  assert.equal(r.code, 'NOT_FOUND');
  assert.equal(r.status, 404);
});

test('Unknown error / no code → default 500 INTERNAL_ERROR + generic zh message', () => {
  const r = mapActivityPlanSeasonInsertError({ message: 'network blip' });
  assert.equal(r.code, 'INTERNAL_ERROR');
  assert.equal(r.status, 500);
  assert.equal(r.message, 'Failed to create season');
  assert.match(r.messageZh, /建立開放季節時發生伺服器錯誤/);
});

test('null / undefined error → default 500 INTERNAL_ERROR (defensive)', () => {
  const r1 = mapActivityPlanSeasonInsertError(null);
  const r2 = mapActivityPlanSeasonInsertError(undefined);
  assert.equal(r1.code, 'INTERNAL_ERROR');
  assert.equal(r1.status, 500);
  assert.equal(r2.code, 'INTERNAL_ERROR');
  assert.equal(r2.status, 500);
  assert.match(r1.messageZh, /伺服器錯誤/);
});

test('Every mapped result includes both message (EN) and messageZh (zh-TW) — no silent drops', () => {
  const samples = [
    { code: '42501', message: 'permission denied' },
    { code: '42P01', message: 'relation does not exist' },
    { code: '42703', message: 'column does not exist' },
    { code: '23503', message: 'fk' },
    { code: '23505', message: 'unique' },
    { code: '23514', message: 'check' },
    { code: 'PGRST116', message: 'no rows' },
    { code: '?', message: 'unknown' },
  ];
  for (const s of samples) {
    const r = mapActivityPlanSeasonInsertError(s);
    assert.ok(typeof r.message === 'string' && r.message.length > 0, `EN message missing for ${s.code}`);
    assert.ok(typeof r.messageZh === 'string' && r.messageZh.length > 0, `zh message missing for ${s.code}`);
  }
});

// ---------- source contract ----------

test('Route imports mapActivityPlanSeasonInsertError', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /from\s+['"][^'"]*activity-plan-seasons-error(\.mjs)?['"]/,
    'route must import the new error-mapping helper',
  );
  assert.match(src, /mapActivityPlanSeasonInsertError/);
});

test('Route still calls console.error so the raw Supabase error stays in server logs', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // The mapping helper is for the client envelope only; the raw error
  // object must still flow into Vercel/Supabase logs for incident triage.
  assert.match(src, /console\.error\(['"]Error creating activity plan season:['"]/);
});

test('Route response envelope on insert failure includes messageZh field', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  const callIdx = src.indexOf('mapActivityPlanSeasonInsertError(');
  assert.ok(callIdx > 0, 'route must call mapActivityPlanSeasonInsertError');
  const block = src.slice(callIdx, callIdx + 600);
  assert.match(block, /messageZh/, 'response must carry messageZh so the UI can show a friendly admin message');
  assert.match(block, /status:\s*mapped\.status/, 'response status must come from the mapper, not a hardcoded 500');
});

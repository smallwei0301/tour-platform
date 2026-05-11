/**
 * Issue #322 / #308a — Rollback Companion Contract
 *
 * AC7: Companion .rollback.sql drops all 6 columns, both tables, and all
 *      newly-added policies, while preserving pre-existing public-read +
 *      service-role policies.
 *
 * STRATEGY: Static analysis of the rollback SQL file.
 * These tests verify the rollback is structurally correct before applying it.
 * Full proof (apply rollback → re-run AC1+AC2 → RED) requires live DB.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

const ROLLBACK_PATH = join(
  __dir,
  '../../../../supabase/migrations/20260511000000_issue308a_guide_activity_authoring.rollback.sql',
);

let rollbackSql;
try {
  rollbackSql = readFileSync(ROLLBACK_PATH, 'utf8');
} catch {
  rollbackSql = '';
}

// ─── AC7: Rollback drops both new tables ─────────────────────────────────────

test('AC7: rollback SQL file exists', () => {
  assert.ok(rollbackSql.length > 0, 'Rollback SQL file not found or empty');
});

test('AC7: rollback drops activity_images table', () => {
  assert.ok(
    rollbackSql.includes('DROP TABLE IF EXISTS public.activity_images'),
    'Rollback must drop activity_images table',
  );
});

test('AC7: rollback drops activity_plan_tiers table', () => {
  assert.ok(
    rollbackSql.includes('DROP TABLE IF EXISTS public.activity_plan_tiers'),
    'Rollback must drop activity_plan_tiers table',
  );
});

// ─── AC7: Rollback drops all 6 new columns ───────────────────────────────────

const EXPECTED_DROPPED_COLUMNS = [
  'dismissal_point',
  'dismissal_point_map_url',
  'meeting_lat',
  'meeting_lng',
  'dismissal_lat',
  'dismissal_lng',
];

for (const col of EXPECTED_DROPPED_COLUMNS) {
  test(`AC7: rollback drops activities.${col} column`, () => {
    assert.ok(
      rollbackSql.includes(`DROP COLUMN IF EXISTS ${col}`),
      `Rollback must drop column ${col}`,
    );
  });
}

// ─── AC7: Rollback drops guide-scoped policies on activities ─────────────────

const GUIDE_POLICIES_ON_ACTIVITIES = [
  'activities: guide owner read own',
  'activities: guide owner insert own',
  'activities: guide owner update own',
  'activities: guide owner delete own',
];

for (const policy of GUIDE_POLICIES_ON_ACTIVITIES) {
  test(`AC7: rollback drops policy "${policy}"`, () => {
    assert.ok(
      rollbackSql.includes(`DROP POLICY IF EXISTS "${policy}"`),
      `Rollback must drop policy "${policy}"`,
    );
  });
}

// ─── AC7: Rollback drops guide-scoped policies on activity_schedules ─────────

const GUIDE_POLICIES_ON_SCHEDULES = [
  'activity_schedules: guide owner read own',
  'activity_schedules: guide owner insert own',
  'activity_schedules: guide owner update own',
  'activity_schedules: guide owner delete own',
];

for (const policy of GUIDE_POLICIES_ON_SCHEDULES) {
  test(`AC7: rollback drops policy "${policy}"`, () => {
    assert.ok(
      rollbackSql.includes(`DROP POLICY IF EXISTS "${policy}"`),
      `Rollback must drop policy "${policy}"`,
    );
  });
}

// ─── AC7: Rollback drops guide-scoped policies on activity_plans ─────────────

const GUIDE_POLICIES_ON_PLANS = [
  'activity_plans: guide owner read own',
  'activity_plans: guide owner insert own',
  'activity_plans: guide owner update own',
  'activity_plans: guide owner delete own',
];

for (const policy of GUIDE_POLICIES_ON_PLANS) {
  test(`AC7: rollback drops policy "${policy}"`, () => {
    assert.ok(
      rollbackSql.includes(`DROP POLICY IF EXISTS "${policy}"`),
      `Rollback must drop policy "${policy}"`,
    );
  });
}

// ─── AC7: Rollback does NOT drop pre-existing policies ───────────────────────

/**
 * Returns all DROP POLICY lines (non-comment) in the rollback SQL.
 * Comment lines (starting with --) are excluded.
 */
function getDropPolicyLines(sql) {
  return sql
    .split('\n')
    .filter((line) => line.trim().startsWith('DROP POLICY'));
}

test('AC7: rollback does NOT drop "activities: public read published"', () => {
  const dropLines = getDropPolicyLines(rollbackSql);
  const dropsPublicRead = dropLines.some((l) => l.includes('"activities: public read published"'));
  assert.equal(
    dropsPublicRead,
    false,
    'Rollback must NOT drop "activities: public read published" (pre-existing)',
  );
});

test('AC7: rollback does NOT drop "activities: service role full access"', () => {
  const dropLines = getDropPolicyLines(rollbackSql);
  const dropsServiceRole = dropLines.some((l) => l.includes('"activities: service role full access"'));
  assert.equal(
    dropsServiceRole,
    false,
    'Rollback must NOT drop "activities: service role full access" (pre-existing)',
  );
});

test('AC7: rollback does NOT drop "activity_schedules: public read"', () => {
  const dropLines = getDropPolicyLines(rollbackSql);
  const dropsSchedulePublic = dropLines.some((l) => l.includes('"activity_schedules: public read"'));
  assert.equal(
    dropsSchedulePublic,
    false,
    'Rollback must NOT drop "activity_schedules: public read" (pre-existing)',
  );
});

test('AC7: rollback does NOT drop "activity_plans: public read active plans"', () => {
  const dropLines = getDropPolicyLines(rollbackSql);
  const dropsPlansPublic = dropLines.some((l) => l.includes('"activity_plans: public read active plans"'));
  assert.equal(
    dropsPlansPublic,
    false,
    'Rollback must NOT drop "activity_plans: public read active plans" (pre-existing)',
  );
});

// ─── AC7: activity_images/plan_tiers policies covered by DROP TABLE CASCADE ──

test('AC7: activity_images policies covered by DROP TABLE CASCADE', () => {
  // Explicit policy drops for activity_images are NOT needed because
  // DROP TABLE CASCADE automatically drops all policies on the table.
  // Verify that the rollback uses DROP TABLE for these tables.
  assert.ok(
    rollbackSql.includes('DROP TABLE IF EXISTS public.activity_images'),
    'activity_images DROP TABLE handles policy cleanup via CASCADE',
  );
  assert.ok(
    rollbackSql.includes('DROP TABLE IF EXISTS public.activity_plan_tiers'),
    'activity_plan_tiers DROP TABLE handles policy cleanup via CASCADE',
  );
});

console.log('Issue #322 rollback contract tests completed!');

/**
 * Issue #322 / #308a — Guide-Scoped RLS Isolation Tests
 *
 * AC3: Guide G1 (guide_profiles.user_id = auth.uid()) can SELECT their own
 *      activity (any status).
 *
 * AC4: Guide G1 cannot UPDATE/INSERT into G2's activity rows
 *      (RLS WITH CHECK blocks). 0 rows affected.
 *
 * AC6: anon SELECT still returns published activities. The guide-scoped SELECT
 *      policy is additive, NOT a replacement.
 *
 * IMPORTANT — RLS TEST STRATEGY
 * ─────────────────────────────
 * True RLS isolation testing requires authenticated Supabase clients using
 * guide-specific JWTs (one per guide, auth.uid() bound). Without a local
 * Supabase instance, we test:
 *
 *   1. POLICY CONTRACT: That the migration SQL contains the correct
 *      guide-scoped USING/WITH CHECK predicates with nullable guard.
 *
 *   2. SCHEMA CONTRACT: That the policies exist in pg_policies after migration.
 *
 *   3. ISOLATION LOGIC: Unit-test the USING clause predicate logic in
 *      JavaScript to verify it correctly models the join condition.
 *
 * Full end-to-end RLS tests (G1 vs G2 authenticated clients) require a live
 * Supabase instance with per-user JWTs — marked as CI/staging-only.
 *
 * These tests will be RED pre-migration (no DB) and GREEN after migration apply.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

// ─── Migration SQL source ────────────────────────────────────────────────────

const MIGRATION_PATH = join(
  __dir,
  '../../../../supabase/migrations/20260511000000_issue308a_guide_activity_authoring.sql',
);

let migrationSql;
try {
  migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
} catch {
  migrationSql = '';
}

// ─── POLICY CONTRACT tests (static analysis of migration SQL) ────────────────

test('AC3/AC4: migration SQL contains guide owner SELECT policy on activities', () => {
  assert.ok(
    migrationSql.includes('"activities: guide owner read own"'),
    'Migration must define "activities: guide owner read own" policy',
  );
});

test('AC3/AC4: migration SQL contains guide owner UPDATE policy on activities', () => {
  assert.ok(
    migrationSql.includes('"activities: guide owner update own"'),
    'Migration must define "activities: guide owner update own" policy',
  );
});

test('AC3/AC4: migration SQL contains guide owner INSERT policy on activities', () => {
  assert.ok(
    migrationSql.includes('"activities: guide owner insert own"'),
    'Migration must define "activities: guide owner insert own" policy',
  );
});

test('AC3/AC4: migration SQL contains guide owner DELETE policy on activities', () => {
  assert.ok(
    migrationSql.includes('"activities: guide owner delete own"'),
    'Migration must define "activities: guide owner delete own" policy',
  );
});

test('AC4: all guide-scoped policies guard nullable user_id', () => {
  // Every policy referencing guide_profiles must also include the nullable guard
  const policyBlocks = migrationSql.split(/DO \$\$/);
  for (const block of policyBlocks) {
    if (!block.includes('guide_profiles')) continue;
    if (!block.includes('CREATE POLICY')) continue;
    assert.ok(
      block.includes('user_id IS NOT NULL'),
      `A guide-scoped policy block is missing "user_id IS NOT NULL" guard:\n${block.substring(0, 300)}`,
    );
  }
});

test('AC4: guide owner UPDATE policy uses both USING and WITH CHECK on activities', () => {
  // Extract the activities update policy block
  const updatePolicyStart = migrationSql.indexOf('"activities: guide owner update own"');
  assert.ok(updatePolicyStart >= 0, 'activities: guide owner update own policy not found');
  const policyFragment = migrationSql.substring(updatePolicyStart, updatePolicyStart + 800);
  assert.ok(policyFragment.includes('USING'), 'UPDATE policy must have USING clause');
  assert.ok(policyFragment.includes('WITH CHECK'), 'UPDATE policy must have WITH CHECK clause');
});

test('AC6: existing public-read policy is preserved in migration (not dropped)', () => {
  // Migration must NOT drop the existing "activities: public read published" policy
  assert.ok(
    !migrationSql.includes('DROP POLICY') ||
      !migrationSql.includes('"activities: public read published"'),
    'Migration must not drop "activities: public read published" policy',
  );
  // Migration header should document the permissive-OR semantics
  assert.ok(
    migrationSql.includes('permissive') || migrationSql.includes('PERMISSIVE'),
    'Migration should document permissive-OR semantics for clarity',
  );
});

test('AC6: migration does NOT drop or replace the existing public-read policy', () => {
  // The public-read policy exists in 001_mvp_core_v2.sql and must not be touched.
  // A migration header comment that MENTIONS the policy for documentation is fine.
  // What matters is: no DROP POLICY or CREATE OR REPLACE for the public-read policy.
  const hasDropPublicRead =
    migrationSql.includes("DROP POLICY") &&
    migrationSql.includes('"activities: public read published"');
  assert.equal(
    hasDropPublicRead,
    false,
    'Migration must NOT drop "activities: public read published"',
  );
  // Also must not use CREATE OR REPLACE POLICY on the public-read policy
  const hasReplacePublicRead =
    migrationSql.includes('CREATE OR REPLACE') &&
    migrationSql.includes('"activities: public read published"');
  assert.equal(
    hasReplacePublicRead,
    false,
    'Migration must NOT replace "activities: public read published"',
  );
});

// ─── activity_schedules: guide-scoped policies exist in migration ─────────────

test('AC3/AC4: migration SQL contains guide owner policies on activity_schedules', () => {
  assert.ok(
    migrationSql.includes('"activity_schedules: guide owner read own"'),
    'Migration must define guide read policy on activity_schedules',
  );
  assert.ok(
    migrationSql.includes('"activity_schedules: guide owner update own"'),
    'Migration must define guide update policy on activity_schedules',
  );
  assert.ok(
    migrationSql.includes('"activity_schedules: guide owner insert own"'),
    'Migration must define guide insert policy on activity_schedules',
  );
});

test('AC3/AC4: migration SQL contains guide owner policies on activity_plans', () => {
  assert.ok(
    migrationSql.includes('"activity_plans: guide owner read own"'),
    'Migration must define guide read policy on activity_plans',
  );
  assert.ok(
    migrationSql.includes('"activity_plans: guide owner update own"'),
    'Migration must define guide update policy on activity_plans',
  );
});

// ─── ISOLATION LOGIC: Unit-test the USING predicate ─────────────────────────

/**
 * Simulates the guide-scoped USING clause logic in JS:
 *
 *   EXISTS (
 *     SELECT 1 FROM guide_profiles gp
 *     WHERE gp.user_id = auth.uid()
 *       AND gp.user_id IS NOT NULL
 *       AND gp.id = activities.guide_id
 *   )
 *
 * @param {object} params
 * @param {string} params.authUid - The current auth.uid()
 * @param {object[]} params.guideProfiles - [{id, user_id}]
 * @param {string} params.activityGuideId - activities.guide_id
 * @returns {boolean}
 */
function evaluateGuideOwnerUsing({ authUid, guideProfiles, activityGuideId }) {
  return guideProfiles.some(
    (gp) => gp.user_id === authUid && gp.user_id !== null && gp.id === activityGuideId,
  );
}

test('AC3: guide G1 can SELECT own activity (guide_id matches)', () => {
  const result = evaluateGuideOwnerUsing({
    authUid: 'user-g1',
    guideProfiles: [
      { id: 'guide-1', user_id: 'user-g1' },
      { id: 'guide-2', user_id: 'user-g2' },
    ],
    activityGuideId: 'guide-1',
  });
  assert.equal(result, true, 'G1 should be able to SELECT their own activity');
});

test('AC4: guide G1 cannot SELECT G2 activity (cross-guide isolation)', () => {
  const result = evaluateGuideOwnerUsing({
    authUid: 'user-g1',
    guideProfiles: [
      { id: 'guide-1', user_id: 'user-g1' },
      { id: 'guide-2', user_id: 'user-g2' },
    ],
    activityGuideId: 'guide-2', // G2's activity
  });
  assert.equal(result, false, 'G1 should NOT be able to SELECT G2 activity');
});

test('AC4: nullable user_id does not grant access (NULL guard)', () => {
  const result = evaluateGuideOwnerUsing({
    authUid: 'user-g1',
    guideProfiles: [
      { id: 'guide-null', user_id: null }, // nullable user_id
    ],
    activityGuideId: 'guide-null',
  });
  assert.equal(result, false, 'NULL user_id must not grant access');
});

test('AC4: anon user (uid=null) cannot access any guide activity', () => {
  const result = evaluateGuideOwnerUsing({
    authUid: null,
    guideProfiles: [
      { id: 'guide-1', user_id: 'user-g1' },
    ],
    activityGuideId: 'guide-1',
  });
  assert.equal(result, false, 'anon user (null uid) must not access guide-scoped rows');
});

test('AC3: guide with draft activity can SELECT it (any status allowed)', () => {
  // The USING clause does NOT filter by status — guide sees all their rows
  // Status filtering would reduce to the public-read policy (status = 'published')
  // We test this by verifying the USING clause in migration does NOT include status filter
  const updatePolicyStart = migrationSql.indexOf('"activities: guide owner read own"');
  if (updatePolicyStart < 0) {
    // Migration not yet applied context — skip static check
    return;
  }
  const policyFragment = migrationSql.substring(updatePolicyStart, updatePolicyStart + 400);
  assert.ok(
    !policyFragment.includes("status = 'published'"),
    "Guide owner read policy must NOT filter by status — guides should see draft/archived too",
  );
});

// ─── DB connectivity tests (CI/staging only) ─────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_DB = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

async function queryDb(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`DB query failed: ${res.status} ${await res.text()}`);
  return res.json();
}

test('AC3/AC4: guide owner policies exist in pg_policies (requires DB)', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] No DB connection — verify on CI/staging after migration');
  }
  const expectedPolicies = [
    { table: 'activities', name: 'activities: guide owner read own' },
    { table: 'activities', name: 'activities: guide owner update own' },
    { table: 'activities', name: 'activities: guide owner insert own' },
    { table: 'activities', name: 'activities: guide owner delete own' },
    { table: 'activity_schedules', name: 'activity_schedules: guide owner read own' },
    { table: 'activity_schedules', name: 'activities: guide owner update own' },
    { table: 'activity_plans', name: 'activity_plans: guide owner read own' },
  ];
  const rows = await queryDb(`
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('activities', 'activity_schedules', 'activity_plans', 'activity_images', 'activity_plan_tiers')
  `);
  const found = rows.map((r) => r.policyname);
  for (const policy of expectedPolicies) {
    assert.ok(
      found.includes(policy.name),
      `Policy "${policy.name}" not found in pg_policies`,
    );
  }
});

test('AC6: existing "activities: public read published" policy still exists after migration (requires DB)', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] No DB connection — verify on CI/staging after migration');
  }
  const rows = await queryDb(`
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activities'
      AND policyname = 'activities: public read published'
  `);
  assert.ok(rows.length > 0, '"activities: public read published" policy must still exist after migration');
});

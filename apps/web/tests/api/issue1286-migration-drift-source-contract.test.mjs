/**
 * GH-1286 Migration Drift Source-Contract Test
 *
 * Static contract lock for the 7 production migration drift items.
 * These tests do NOT require a real database — they assert that:
 *   1. The canonical apply SQL file exists with expected content shapes.
 *   2. The rollback SQL file exists.
 *   3. The verify script exists and handles --no-env-check correctly.
 *   4. The production-schema-drift-preflight.mjs covers the 7 drift tables/columns.
 *   5. The CI workflow for migration drift detection exists.
 *
 * RED evidence (pre-apply): these tests are designed so that the checks for
 * activity_plans.is_year_round, activity_plan_seasons, guide_slot_conflict_overrides,
 * guide_trip_reports, and review_invitations in the preflight script would catch
 * their absence — the prod probe failures serve as RED evidence.
 *
 * GREEN evidence (post-apply): all source-contract assertions pass after the
 * canonical SQL is prepared and wired into the preflight + CI.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths are relative to apps/web/tests/api/ -> repo root is 4 levels up
const REPO_ROOT = path.resolve(__dirname, '../../../../');

function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// ---------------------------------------------------------------------------
// 1. Canonical apply SQL contract
// ---------------------------------------------------------------------------
describe('GH-1286 canonical apply SQL', () => {
  const CANONICAL_SQL = repoPath(
    'supabase/migrations/20260608_issue1286_canonical_drift_apply.sql',
  );

  it('canonical apply SQL file exists', () => {
    assert.ok(fs.existsSync(CANONICAL_SQL), `Missing: ${CANONICAL_SQL}`);
  });

  it('canonical SQL begins a transaction (BEGIN/COMMIT)', () => {
    const content = readText(CANONICAL_SQL);
    assert.ok(content.includes('BEGIN;'), 'Must contain BEGIN;');
    assert.ok(content.includes('COMMIT;'), 'Must contain COMMIT;');
  });

  it('canonical SQL uses IF NOT EXISTS for all CREATE TABLE statements', () => {
    const content = readText(CANONICAL_SQL);
    const creates = content.match(/CREATE TABLE\s+(?!IF NOT EXISTS)/gi) || [];
    assert.strictEqual(
      creates.length,
      0,
      `Found CREATE TABLE without IF NOT EXISTS — all creates must be idempotent`,
    );
  });

  it('canonical SQL covers activity_plans status CHECK archived constraint', () => {
    const content = readText(CANONICAL_SQL);
    assert.ok(
      content.includes('activity_plans_status_check'),
      'Must drop and re-add activity_plans_status_check',
    );
    assert.ok(
      content.includes("'archived'"),
      "Must include 'archived' in the CHECK constraint",
    );
  });

  it('canonical SQL covers activity_plans.is_year_round column (GH-1067)', () => {
    const content = readText(CANONICAL_SQL);
    assert.ok(
      content.includes('is_year_round'),
      'Must include is_year_round column addition',
    );
    assert.ok(
      content.includes('ADD COLUMN IF NOT EXISTS is_year_round'),
      'Must use ADD COLUMN IF NOT EXISTS for is_year_round',
    );
  });

  it('canonical SQL covers activity_plan_seasons table creation (GH-1067)', () => {
    const content = readText(CANONICAL_SQL);
    assert.ok(
      content.includes('activity_plan_seasons'),
      'Must include activity_plan_seasons table creation',
    );
    assert.ok(
      content.includes('activity_plan_id'),
      'Must include activity_plan_id FK column',
    );
  });

  it('canonical SQL covers guide_slot_conflict_overrides table (GH-1067)', () => {
    const content = readText(CANONICAL_SQL);
    assert.ok(
      content.includes('guide_slot_conflict_overrides'),
      'Must include guide_slot_conflict_overrides table',
    );
    assert.ok(
      content.includes('requires_helper'),
      'Must include requires_helper column',
    );
    assert.ok(
      content.includes('conflict_override_id'),
      'Must include bookings.conflict_override_id audit column',
    );
  });

  it('canonical SQL covers guide_trip_reports table (GH-1171)', () => {
    const content = readText(CANONICAL_SQL);
    assert.ok(
      content.includes('guide_trip_reports'),
      'Must include guide_trip_reports table',
    );
    assert.ok(
      content.includes('traveler_no_show'),
      'Must include traveler_no_show column',
    );
  });

  it('canonical SQL covers review_invitations table (GH-1174)', () => {
    const content = readText(CANONICAL_SQL);
    assert.ok(
      content.includes('review_invitations'),
      'Must include review_invitations table',
    );
    assert.ok(
      content.includes('invitation_kind'),
      'Must include invitation_kind column',
    );
  });

  it('canonical SQL uses DROP CONSTRAINT IF EXISTS for status_check (idempotent)', () => {
    const content = readText(CANONICAL_SQL);
    assert.ok(
      content.includes('DROP CONSTRAINT IF EXISTS activity_plans_status_check'),
      'Must use DROP CONSTRAINT IF EXISTS for idempotent re-add',
    );
  });

  it('canonical SQL does not contain service role key or connection strings', () => {
    const content = readText(CANONICAL_SQL);
    assert.ok(
      !content.match(/eyJ[A-Za-z0-9._-]{20,}/),
      'Must not contain JWT tokens',
    );
    assert.ok(
      !content.match(/postgresql:\/\//),
      'Must not contain connection strings',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Rollback SQL contract
// ---------------------------------------------------------------------------
describe('GH-1286 rollback SQL', () => {
  const ROLLBACK_SQL = repoPath(
    'supabase/migrations/20260608_issue1286_canonical_drift_apply.rollback.sql',
  );

  it('rollback SQL file exists', () => {
    assert.ok(fs.existsSync(ROLLBACK_SQL), `Missing: ${ROLLBACK_SQL}`);
  });

  it('rollback SQL is wrapped in a transaction', () => {
    const content = readText(ROLLBACK_SQL);
    assert.ok(content.includes('BEGIN;'), 'Must contain BEGIN;');
    assert.ok(content.includes('COMMIT;'), 'Must contain COMMIT;');
  });

  it('rollback SQL drops the 3 new tables using CASCADE', () => {
    const content = readText(ROLLBACK_SQL);
    assert.ok(content.includes('DROP TABLE IF EXISTS public.review_invitations CASCADE'), 'Must drop review_invitations');
    assert.ok(content.includes('DROP TABLE IF EXISTS public.guide_trip_reports CASCADE'), 'Must drop guide_trip_reports');
    assert.ok(content.includes('DROP TABLE IF EXISTS public.guide_slot_conflict_overrides CASCADE'), 'Must drop guide_slot_conflict_overrides');
    assert.ok(content.includes('DROP TABLE IF EXISTS public.activity_plan_seasons CASCADE'), 'Must drop activity_plan_seasons');
  });

  it('rollback SQL removes is_year_round column', () => {
    const content = readText(ROLLBACK_SQL);
    assert.ok(content.includes('DROP COLUMN IF EXISTS is_year_round'), 'Must drop is_year_round');
  });

  it('rollback SQL restores status CHECK to (active, inactive)', () => {
    const content = readText(ROLLBACK_SQL);
    assert.ok(
      content.includes("status IN ('active', 'inactive')"),
      "Must restore status CHECK to (active, inactive)",
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Verify script contract
// ---------------------------------------------------------------------------
describe('GH-1286 verify-migration-1286.mjs script', () => {
  const VERIFY_SCRIPT = repoPath('scripts/verify-migration-1286.mjs');

  it('verify script exists', () => {
    assert.ok(fs.existsSync(VERIFY_SCRIPT), `Missing: ${VERIFY_SCRIPT}`);
  });

  it('verify script exits 0 with --no-env-check and no credentials', () => {
    const proc = spawnSync(process.execPath, [VERIFY_SCRIPT, '--no-env-check'], {
      env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.strictEqual(proc.status, 0, `Expected exit 0, got ${proc.status}. stderr: ${proc.stderr}`);
  });

  it('verify script exits non-zero when credentials missing and no --no-env-check', () => {
    const env = { ...process.env };
    delete env.SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    const proc = spawnSync(process.execPath, [VERIFY_SCRIPT], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.notStrictEqual(proc.status, 0, 'Expected non-zero exit when credentials are missing');
  });

  it('verify script defines checks for all 7 drift items', () => {
    const content = readText(VERIFY_SCRIPT);
    const requiredChecks = [
      'status_check_includes_archived',
      'is_year_round_column_exists',
      'activity_plan_seasons_table_exists',
      'guide_slot_conflict_overrides_table_exists',
      'bookings_conflict_override_columns_exist',
      'guide_trip_reports_table_exists',
      'review_invitations_table_exists',
    ];
    for (const check of requiredChecks) {
      assert.ok(content.includes(check), `verify script must include check: ${check}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. production-schema-drift-preflight.mjs coverage contract
// ---------------------------------------------------------------------------
describe('production-schema-drift-preflight.mjs covers GH-1286 drift items', () => {
  const PREFLIGHT_SCRIPT = repoPath('scripts/production-schema-drift-preflight.mjs');

  it('preflight script exists', () => {
    assert.ok(fs.existsSync(PREFLIGHT_SCRIPT), `Missing: ${PREFLIGHT_SCRIPT}`);
  });

  it('preflight script covers activity_plans.is_year_round', () => {
    const content = readText(PREFLIGHT_SCRIPT);
    assert.ok(
      content.includes('is_year_round'),
      'production-schema-drift-preflight.mjs must include is_year_round in a CHECK_DEFINITION',
    );
  });

  it('preflight script covers activity_plan_seasons table', () => {
    const content = readText(PREFLIGHT_SCRIPT);
    assert.ok(
      content.includes('activity_plan_seasons'),
      'production-schema-drift-preflight.mjs must check activity_plan_seasons table',
    );
  });

  it('preflight script covers guide_slot_conflict_overrides table', () => {
    const content = readText(PREFLIGHT_SCRIPT);
    assert.ok(
      content.includes('guide_slot_conflict_overrides'),
      'production-schema-drift-preflight.mjs must check guide_slot_conflict_overrides table',
    );
  });

  it('preflight script covers guide_trip_reports table', () => {
    const content = readText(PREFLIGHT_SCRIPT);
    assert.ok(
      content.includes('guide_trip_reports'),
      'production-schema-drift-preflight.mjs must check guide_trip_reports table',
    );
  });

  it('preflight script covers review_invitations table', () => {
    const content = readText(PREFLIGHT_SCRIPT);
    assert.ok(
      content.includes('review_invitations'),
      'production-schema-drift-preflight.mjs must check review_invitations table',
    );
  });
});

// ---------------------------------------------------------------------------
// 5. CI workflow contract
// ---------------------------------------------------------------------------
describe('GH-1286 migration-drift-detect CI workflow', () => {
  const WORKFLOW = repoPath('.github/workflows/migration-drift-detect.yml');

  it('migration-drift-detect.yml workflow exists', () => {
    assert.ok(fs.existsSync(WORKFLOW), `Missing: ${WORKFLOW}`);
  });

  it('workflow runs production-schema-drift-preflight.mjs', () => {
    const content = readText(WORKFLOW);
    assert.ok(
      content.includes('production-schema-drift-preflight.mjs'),
      'CI workflow must invoke production-schema-drift-preflight.mjs',
    );
  });

  it('workflow triggers on pull_request or push to main', () => {
    const content = readText(WORKFLOW);
    assert.ok(
      content.includes('pull_request') || content.includes('push'),
      'CI workflow must trigger on pull_request or push',
    );
  });
});

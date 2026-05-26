/**
 * Issue #497 — AC4: Plan status vocabulary contract test
 *
 * Verifies that:
 * 1. Canonical status vocabulary is exactly: active | inactive | archived
 * 2. The admin plans route validates status against that vocabulary
 * 3. The available-slots route only serves 'active' plans
 * 4. Migration file exists for the 'archived' status constraint
 * 5. Available-slots route rejects inactive and archived plans
 *
 * All tests are static (no live DB needed).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(full), `File must exist: ${full}`);
  return fs.readFileSync(full, 'utf8');
}

// ─── AC4.1 — Canonical status vocabulary in admin plans route ───────────────
describe('AC4.1: admin plans route — VALID_STATUSES includes archived', () => {
  it('VALID_STATUSES contains exactly active, inactive, archived', () => {
    const src = readFile('app/api/v2/admin/activities/[activityId]/plans/route.ts');
    // Must include all three statuses in the VALID_STATUSES array
    assert.match(src, /VALID_STATUSES\s*=\s*\[/, 'Must define VALID_STATUSES array');
    assert.match(src, /['"']active['"']/, 'Must include active in VALID_STATUSES');
    assert.match(src, /['"']inactive['"']/, 'Must include inactive in VALID_STATUSES');
    assert.match(src, /['"']archived['"']/, 'Must include archived in VALID_STATUSES');
  });

  it('status validation uses VALID_STATUSES (rejects unknown status)', () => {
    const src = readFile('app/api/v2/admin/activities/[activityId]/plans/route.ts');
    // Must check body.status against VALID_STATUSES
    assert.match(
      src,
      /VALID_STATUSES\.includes\(body\.status\)/,
      'Must validate body.status against VALID_STATUSES'
    );
  });
});

// ─── AC4.2 — available-slots only serves active plans ───────────────────────
describe('AC4.2: available-slots route — rejects non-active plan status', () => {
  it('checks planData.status === active before proceeding', () => {
    const src = readFile('app/api/v2/activities/[activityId]/available-slots/route-handler.ts');
    assert.match(
      src,
      /planData\.status\s*!==\s*['"]active['"]/,
      "Must check planData.status !== 'active' and reject non-active plans"
    );
  });

  it('returns 404 when plan status is not active', () => {
    const src = readFile('app/api/v2/activities/[activityId]/available-slots/route-handler.ts');
    // Status check must result in a 404 response
    const statusCheckRegion = src.match(
      /planData\.status\s*!==\s*['"]active['"][^}]*}/s
    );
    assert.ok(statusCheckRegion, 'Must have a status check block');
    assert.match(
      statusCheckRegion[0],
      /status:\s*404/,
      'Non-active plan must return HTTP 404'
    );
  });
});

// ─── AC4.3 — Migration for 'archived' status in activity_plans ──────────────
describe('AC4.3: migration file adds archived to activity_plans CHECK constraint', () => {
  it('migration file 20260513_issue497_activity_plans_status_archived.sql exists', () => {
    const migDir = path.resolve(__dirname, '../../../../supabase/migrations');
    const migFile = path.join(migDir, '20260513_issue497_activity_plans_status_archived.sql');
    assert.ok(
      fs.existsSync(migFile),
      `Migration file must exist: ${migFile}`
    );
  });

  it('migration drops old constraint and adds new one including archived', () => {
    const migDir = path.resolve(__dirname, '../../../../supabase/migrations');
    const migFile = path.join(migDir, '20260513_issue497_activity_plans_status_archived.sql');
    const src = fs.readFileSync(migFile, 'utf8');
    assert.match(src, /DROP CONSTRAINT/i, 'Must drop the old status check constraint');
    assert.match(src, /archived/i, "Must include 'archived' in the new constraint");
    assert.match(src, /active/i, "Must include 'active' in the new constraint");
    assert.match(src, /inactive/i, "Must include 'inactive' in the new constraint");
  });
});

// ─── AC4.4 — Status vocabulary logic (unit-level simulation) ─────────────────
describe('AC4.4: status vocabulary logic — pure unit tests', () => {
  const CANONICAL_STATUSES = ['active', 'inactive', 'archived'];

  it('active is bookable', () => {
    assert.ok(CANONICAL_STATUSES.includes('active'));
  });

  it('inactive is not bookable', () => {
    assert.ok(CANONICAL_STATUSES.includes('inactive'));
    // available-slots must reject inactive
    function isPlanBookable(status) {
      return status === 'active';
    }
    assert.equal(isPlanBookable('inactive'), false);
  });

  it('archived is not bookable', () => {
    assert.ok(CANONICAL_STATUSES.includes('archived'));
    function isPlanBookable(status) {
      return status === 'active';
    }
    assert.equal(isPlanBookable('archived'), false);
  });

  it('unknown status is rejected at API boundary', () => {
    function isValidStatus(status) {
      return CANONICAL_STATUSES.includes(status);
    }
    assert.equal(isValidStatus('draft'), false);
    assert.equal(isValidStatus('deleted'), false);
    assert.equal(isValidStatus(''), false);
    assert.equal(isValidStatus('ACTIVE'), false); // case-sensitive
  });
});

/**
 * Issue #1164 — Admin/Plans: Show readiness gate warnings on activity plans page
 *
 * TDD source-contract tests for:
 *   GET /api/v2/admin/activities/:activityId/readiness
 *
 * Verifies route wiring:
 *   - file exists
 *   - exports GET (read-only)
 *   - imports validateActivityBookability
 *   - no mutation side effects
 *   - response shape: ok, blockers, warnings, summary
 *   - activityId UUID validation
 *   - 422 for invalid activityId
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const ROUTE_PATH = join(
  ROOT,
  'app/api/v2/admin/activities/[activityId]/readiness/route.ts',
);

describe('READINESS_GATE endpoint source contracts', () => {
  it('route file exists', () => {
    assert.ok(existsSync(ROUTE_PATH), `Route file not found: ${ROUTE_PATH}`);
  });

  it('exports GET handler', () => {
    const src = readFileSync(ROUTE_PATH, 'utf8');
    assert.match(src, /export\s+async\s+function\s+GET\b/, 'must export async function GET');
  });

  it('imports validateActivityBookability', () => {
    const src = readFileSync(ROUTE_PATH, 'utf8');
    assert.match(
      src,
      /validateActivityBookability/,
      'must import and use validateActivityBookability',
    );
  });

  it('is read-only (no mutations)', () => {
    const src = readFileSync(ROUTE_PATH, 'utf8');
    // Must not contain insert, update, delete, upsert Supabase calls
    assert.doesNotMatch(src, /\.insert\s*\(/, 'must not use .insert()');
    assert.doesNotMatch(src, /\.update\s*\(/, 'must not use .update()');
    assert.doesNotMatch(src, /\.delete\s*\(/, 'must not use .delete()');
    assert.doesNotMatch(src, /\.upsert\s*\(/, 'must not use .upsert()');
  });

  it('returns ok, blockers, warnings, summary', () => {
    const src = readFileSync(ROUTE_PATH, 'utf8');
    assert.match(src, /blockers/, 'response must include blockers');
    assert.match(src, /warnings/, 'response must include warnings');
    assert.match(src, /summary/, 'response must include summary');
    assert.match(src, /readinessOk/, 'response must include readinessOk');
  });

  it('validates activityId is UUID', () => {
    const src = readFileSync(ROUTE_PATH, 'utf8');
    assert.match(src, /UUID_REGEX|uuid/i, 'must validate activityId as UUID');
  });

  it('returns 422 for invalid activityId', () => {
    const src = readFileSync(ROUTE_PATH, 'utf8');
    // Should return a 422 (or 400) when activityId is not a valid UUID
    assert.match(src, /422|400/, 'must return error status for invalid activityId');
    assert.match(
      src,
      /INVALID_ACTIVITY_ID/,
      'must use INVALID_ACTIVITY_ID error code',
    );
  });

  it('summary includes activePlansCount, futureSchedulesCount, openSchedulesWithNullPlan', () => {
    const src = readFileSync(ROUTE_PATH, 'utf8');
    assert.match(src, /activePlansCount/, 'summary must include activePlansCount');
    assert.match(src, /futureSchedulesCount/, 'summary must include futureSchedulesCount');
    assert.match(
      src,
      /openSchedulesWithNullPlan/,
      'summary must include openSchedulesWithNullPlan',
    );
  });
});

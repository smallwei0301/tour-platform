/**
 * Source-contract tests for GET /api/v2/guide/trip-reports-due
 * Issue #1169: Guide dashboard — show overdue trip reports
 *
 * Pattern: readFileSync + regex match on source (no live server needed).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const routePath = join(ROOT, 'app/api/v2/guide/trip-reports-due/route.ts');

describe('GUIDE_TRIP_REPORTS_DUE endpoint source contracts', () => {
  it('route file exists', () => {
    assert.ok(
      existsSync(routePath),
      `Expected route file to exist at ${routePath}`
    );
  });

  it('exports GET handler', () => {
    const src = readFileSync(routePath, 'utf8');
    assert.match(src, /export\s+async\s+function\s+GET/, 'GET handler not exported');
  });

  it('imports tripReportStatus from post-trip-eligibility', () => {
    const src = readFileSync(routePath, 'utf8');
    assert.match(
      src,
      /import.*tripReportStatus.*from.*post-trip-eligibility/,
      'tripReportStatus import not found'
    );
  });

  it('is read-only (no mutations)', () => {
    const src = readFileSync(routePath, 'utf8');
    assert.doesNotMatch(src, /\.insert\(/, 'unexpected .insert() call — route must be read-only');
    assert.doesNotMatch(src, /\.update\(/, 'unexpected .update() call — route must be read-only');
    assert.doesNotMatch(src, /\.delete\(/, 'unexpected .delete() call — route must be read-only');
    assert.doesNotMatch(src, /export.*POST/, 'unexpected POST export — route must be read-only');
    assert.doesNotMatch(src, /export.*PUT/, 'unexpected PUT export — route must be read-only');
    assert.doesNotMatch(src, /export.*DELETE/, 'unexpected DELETE export — route must be read-only');
  });

  it('returns tripReportsDue array and count', () => {
    const src = readFileSync(routePath, 'utf8');
    assert.match(src, /tripReportsDue/, 'tripReportsDue field missing from response');
    assert.match(src, /count/, 'count field missing from response');
  });

  it('validates guide session', () => {
    const src = readFileSync(routePath, 'utf8');
    assert.match(src, /verifyGuideSession/, 'verifyGuideSession not called — auth missing');
    assert.match(src, /UNAUTHORIZED/, "UNAUTHORIZED error code missing — 401 guard not present");
  });
});

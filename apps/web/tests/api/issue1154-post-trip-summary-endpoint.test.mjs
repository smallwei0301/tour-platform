import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve paths relative to this file: tests/api/ -> ../.. -> apps/web/
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

describe('POST_TRIP_SUMMARY endpoint source contracts', () => {
  const routePath = join(ROOT, 'app/api/v2/admin/orders/post-trip-summary/route.ts');

  it('route file exists', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(src.length > 0, 'route.ts must exist');
  });

  it('exports GET handler', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(/export.*async.*function.*GET\b|export const GET/.test(src), 'must export GET');
  });

  it('imports post-trip-eligibility predicates', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(src.includes('post-trip-eligibility'), 'must import predicates');
  });

  it('does NOT include any INSERT/UPDATE/DELETE mutations', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(src), 'must be read-only');
  });

  it('returns summary with expected top-level keys', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(
      src.includes('overdueTripReports') &&
      src.includes('readyForReviewInvitation') &&
      src.includes('payoutOnHold') &&
      src.includes('adminFollowupNeeded'),
      'must return all summary keys'
    );
  });

  it('supports since query parameter for date filtering', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(
      src.includes('since') || src.includes('searchParams'),
      'must support since date filter'
    );
  });

  it('includes computedAt timestamp in response', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(src.includes('computedAt'), 'must include computedAt timestamp');
  });
});

// Test the category filter validation
describe('POST_TRIP_SUMMARY category filter', () => {
  const routePath = join(ROOT, 'app/api/v2/admin/orders/post-trip-summary/route.ts');

  it('validates category parameter against allowed values', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(src.includes('VALID_CATEGORIES') || src.includes("'guide_report_risk'"), 'must validate category');
  });

  it('includes categoryFilter in response', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(src.includes('categoryFilter'), 'must return categoryFilter in response');
  });
});

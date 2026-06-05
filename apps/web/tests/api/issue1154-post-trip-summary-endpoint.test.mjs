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
    assert.ok(src.includes('buildAdminPostTripSummary'), 'must import post-trip summary helper');
  });

  it('does NOT include any INSERT/UPDATE/DELETE mutations', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(src), 'must be read-only');
  });

  it('returns summary with expected top-level keys', () => {
    const routeSrc = readFileSync(routePath, 'utf-8');
    const helperSrc = readFileSync(join(ROOT, 'src/lib/admin-post-trip-summary.mjs'), 'utf-8');
    assert.ok(routeSrc.includes('...summary'), 'route must spread helper summary into response payload');
    assert.ok(
      helperSrc.includes('overdueTripReports') &&
      helperSrc.includes('readyForReviewInvitation') &&
      helperSrc.includes('payoutOnHold') &&
      helperSrc.includes('adminFollowupNeeded'),
      'helper must return all summary keys'
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

describe('POST_TRIP_SUMMARY guide trip report split query regression', () => {
  const routePath = join(ROOT, 'app/api/v2/admin/orders/post-trip-summary/route.ts');

  function extractOrdersSelectBlock(source) {
    const match = source.match(/\.from\('orders'\)[\s\S]*?\.select\(`([\s\S]*?)`\)/);
    assert.ok(match, 'expected orders select block in post-trip-summary route');
    return match[1];
  }

  it('does not directly embed guide_trip_reports from orders select', () => {
    const src = readFileSync(routePath, 'utf-8');
    const ordersSelect = extractOrdersSelectBlock(src);
    assert.doesNotMatch(
      ordersSelect,
      /guide_trip_reports\s*\(/,
      'orders select must not directly embed guide_trip_reports because no FK exists from orders'
    );
  });

  it('queries guide_trip_reports separately by booking_id after loading orders', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.match(src, /from\('guide_trip_reports'\)/, 'must query guide_trip_reports separately');
    assert.match(src, /\.in\('booking_id',\s*bookingIds\)/, 'must filter guide_trip_reports by bookingIds');
    assert.match(src, /select\('booking_id, submitted_at'\)/, 'must only fetch booking_id + submitted_at in split query');
  });
});

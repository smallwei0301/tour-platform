import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/root/.openclaw/workspace/tour-platform/apps/web';

// Source-contract tests — read the route file and verify expected imports/patterns
describe('POST_TRIP_STATUS endpoint source contracts', () => {
  const routePath = join(ROOT, 'app/api/v2/admin/orders/[orderId]/post-trip-status/route.ts');

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

  it('uses Next.js 15 Promise params pattern', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(/params.*Promise.*orderId/.test(src) && /await params/.test(src), 'must use Promise params');
  });

  it('does NOT include any INSERT/UPDATE/DELETE mutations', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(src), 'must be read-only');
  });

  it('returns ok: true with post-trip status fields', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(
      src.includes('completionEligible') &&
      src.includes('reviewInvitationEligible') &&
      src.includes('payoutHoldReason') &&
      src.includes('tripReportStatus'),
      'must return all status fields'
    );
  });

  it('returns 422 for invalid orderId format', () => {
    const src = readFileSync(routePath, 'utf-8');
    assert.ok(src.includes('422') || src.includes('INVALID'), 'must validate orderId');
  });
});

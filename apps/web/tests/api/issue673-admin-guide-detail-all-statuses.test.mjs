/**
 * Contract test: admin guide detail GET endpoint returns any guide by ID
 * regardless of verification_status (fixes #673 — pending guides not found).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const routeSource = readFileSync(
  resolve(import.meta.dirname, '../../app/api/admin/guides/[guideId]/route.ts'),
  'utf8'
);

const pageSource = readFileSync(
  resolve(import.meta.dirname, '../../app/(non-locale)/admin/guides/[guideId]/page.tsx'),
  'utf8'
);

describe('admin guide detail — all verification statuses', () => {
  it('route exports GET handler', () => {
    assert.ok(routeSource.includes('export async function GET'), 'GET handler must be exported');
  });

  it('GET handler does NOT filter by verification_status', () => {
    // Extract the GET function body (between GET and PATCH)
    const getBody = routeSource.split('export async function PATCH')[0];
    assert.ok(!getBody.includes('.in(\'verification_status\''), 'GET must not filter by status');
    assert.ok(!getBody.includes('.eq(\'verification_status\''), 'GET must not filter by status eq');
  });

  it('GET handler queries guide_profiles by id', () => {
    const getBody = routeSource.split('export async function PATCH')[0];
    assert.ok(getBody.includes('guide_profiles'), 'must query guide_profiles');
    assert.ok(getBody.includes('.eq(\'id\', guideId)'), 'must filter by guideId');
  });

  it('GET handler uses service_role key (admin access)', () => {
    const getBody = routeSource.split('export async function PATCH')[0];
    assert.ok(getBody.includes('getSupabaseServiceRoleKey()'), 'must use service_role');
  });

  it('page fetches from /api/admin/guides/{guideId} not /approved', () => {
    assert.ok(
      pageSource.includes('/api/admin/guides/${guideId}'),
      'page must call the per-guide endpoint, not the approved list'
    );
    assert.ok(
      !pageSource.includes('/api/admin/guides/approved'),
      'page must NOT call the approved-only endpoint'
    );
  });
});

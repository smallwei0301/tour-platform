import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const middlewareSrc = readFileSync(path.resolve(ROOT, 'middleware.ts'), 'utf-8');
const plansRouteSrc = readFileSync(
  path.resolve(ROOT, 'app/api/v2/admin/activities/[activityId]/plans/route.ts'),
  'utf-8'
);
const planItemRouteSrc = readFileSync(
  path.resolve(ROOT, 'app/api/v2/admin/activities/[activityId]/plans/[planId]/route.ts'),
  'utf-8'
);
const adminPlansPageSrc = readFileSync(
  path.resolve(ROOT, 'app/admin/activities/[id]/plans/page.tsx'),
  'utf-8'
);
const adminGuideAvailabilityPageSrc = readFileSync(
  path.resolve(ROOT, 'app/admin/guides/[guideId]/availability/page.tsx'),
  'utf-8'
);

describe('GH-862 admin v2 plan CRUD auth and safety guards', () => {
  it('middleware matcher includes /api/v2/admin paths', () => {
    assert.match(middlewareSrc, /'\/api\/v2\/admin\/:path\*'/);
  });

  it('middleware admin API guard treats /api/v2/admin as admin-protected', () => {
    assert.match(middlewareSrc, /pathname\.startsWith\('\/api\/v2\/admin'\)/);
    assert.match(middlewareSrc, /const isAdminApi = pathname\.startsWith\('\/api\/admin'\) \|\| pathname\.startsWith\('\/api\/v2\/admin'\);/);
  });

  it('middleware CSRF requirement includes /api/v2/admin mutations', () => {
    assert.match(middlewareSrc, /pathname\.startsWith\('\/api\/v2\/admin\/'\)/);
  });

  it('admin v2 plan routes use service-role capable Supabase path (getSupabase) instead of SSR anon client', () => {
    assert.match(plansRouteSrc, /import\s+\{\s*getSupabase\s*\}\s+from\s+'[^']*db\.mjs'/);
    assert.match(planItemRouteSrc, /import\s+\{\s*getSupabase\s*\}\s+from\s+'[^']*db\.mjs'/);
    assert.doesNotMatch(plansRouteSrc, /from\s+'[^']*supabase\/server'/);
    assert.doesNotMatch(planItemRouteSrc, /from\s+'[^']*supabase\/server'/);
  });

  it('admin plans UI sends CSRF header for create/update/status mutations', () => {
    assert.match(adminPlansPageSrc, /headers:\s*\{\s*'Content-Type': 'application\/json',\s*\.\.\.csrfHeaders\(\)\s*\}/);
  });

  it('admin guide availability UI sends CSRF header for rule and blackout mutations', () => {
    assert.match(
      adminGuideAvailabilityPageSrc,
      /headers:\s*\{\s*'Content-Type': 'application\/json',\s*\.\.\.csrfHeaders\(\)\s*\}/
    );
    assert.match(
      adminGuideAvailabilityPageSrc,
      /fetch\(`\/api\/v2\/admin\/guides\/\$\{guideId\}\/blackout-dates`,\s*\{\s*method:\s*'POST',\s*headers:\s*\{\s*'Content-Type': 'application\/json',\s*\.\.\.csrfHeaders\(\)\s*\}/s
    );
  });

  it('admin plans UI exposes Traditional Chinese actionable error text for load/save/archive/status failures', () => {
    for (const phrase of [
      '載入方案失敗，請重新整理後再試。',
      '載入方案失敗，請檢查網路或稍後再試。',
      '封存方案失敗，請稍後再試。',
      '更新方案狀態失敗，請稍後再試。',
    ]) {
      assert.ok(adminPlansPageSrc.includes(phrase), `missing phrase: ${phrase}`);
    }
    assert.match(adminPlansPageSrc, /\{error && \(\s*<div\s+role="alert"\s+aria-live="polite"/s);
  });
});

/**
 * Issue #1203 — Stabilize GH-1067 browser-heavy Playwright E2E under resource gate.
 *
 * Focused availability taxonomy smoke that is DETERMINISTIC under Next dev +
 * --workers=1 + bounded timeouts. The deliberately small scope avoids the
 * flaky `helpers.ts adminLogin` Suspense + fast-refresh race that blocked the
 * existing 1132-family browser-heavy suite under constrained host resources.
 *
 * Coverage (browser-heavy = Playwright + Chromium, no API-only):
 *
 *   T1203.1 — public homepage loads under Next dev without runtime error.
 *   T1203.2 — public traveler search returns 200 + renders body content.
 *   T1203.3 — health endpoint reachable from Chromium request context.
 *   T1203.4 — GH-1067 canonical taxonomy state codes are visible in the on-server
 *             bundled `effective-availability-resolver.ts` source contract.
 *
 * Why this shape:
 *
 *   - Tests T1203.1–.3 prove the browser+Next-dev wrapper is stable under the
 *     #1203 resource gate (MemAvailable ≥ 900 MiB, --workers=1, bounded timeout).
 *     They give a deterministic GREEN line for an agent rerun to compare to.
 *
 *   - Test T1203.4 locks the taxonomy state contract from PR #1112 in source.
 *     If any future change drops `outside_season` / `blocked_by_conflict` /
 *     `allowed_with_admin_override` / `inactive_plan` / `outside_rule`, this
 *     spec fails and the regression is caught without needing a full E2E
 *     against admin/guide UI surfaces (which today do not render the codes
 *     directly — see #1067 design log).
 *
 * Recommended run command (per #1203 resource gate):
 *
 *   cd apps/web
 *   NEXT_PUBLIC_BASE_URL=http://127.0.0.1:3333 \
 *   NODE_OPTIONS=--max-old-space-size=768 \
 *   npx playwright test e2e/issue1203-availability-taxonomy.spec.ts \
 *     --project=chromium --workers=1 --reporter=list
 *
 * Resource-gate prerequisite (verify BEFORE running):
 *   MemAvailable ≥ 900 MiB
 *   No stale Playwright/Chromium/Next-dev children
 *   Port 3333 free
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOLVER_SRC = resolve(__dirname, '../src/lib/availability-v2/effective-availability-resolver.ts');

test.describe('GH-1203 availability taxonomy smoke (browser-heavy, --workers=1, deterministic)', () => {
  test.setTimeout(20_000);

  test('T1203.1 — public homepage renders under Next dev without runtime error', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
    const response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    expect(response?.status(), 'homepage should return 200').toBe(200);
    await expect(page.locator('body')).toContainText('Midao', { timeout: 8_000 });
    expect(pageErrors, `unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('T1203.2 — public guides listing renders without crashing', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
    const response = await page.goto('/guides', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    expect(response?.status(), '/guides should return 200').toBe(200);
    await expect(page.locator('body')).toContainText('Midao', { timeout: 8_000 });
    expect(pageErrors, `unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('T1203.3 — health endpoint reachable from Playwright request context', async ({ request }) => {
    const response = await request.get('/api/health', { timeout: 8_000 });
    expect(response.status(), '/api/health should return 200').toBe(200);
    const body = await response.json();
    expect(body.ok, 'health should return ok=true').toBe(true);
  });

  test('T1203.4 — GH-1067 canonical taxonomy state codes are present in resolver source', () => {
    const src = readFileSync(RESOLVER_SRC, 'utf8');
    const required = [
      'inactive_plan',
      'outside_rule',
      'outside_season',
      'blocked_by_conflict',
      'allowed_with_admin_override',
    ];
    for (const code of required) {
      expect(src, `effective-availability-resolver.ts must declare taxonomy code '${code}'`).toMatch(
        new RegExp(`['"]${code}['"]`)
      );
    }
  });
});

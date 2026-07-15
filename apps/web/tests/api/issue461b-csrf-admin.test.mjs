/**
 * Issue #474 — add missing CSRF headers to Admin UI mutation calls
 *
 * Static-scan tests (no live DB / network).
 *
 * AC1 — every listed admin file imports csrfHeaders from csrf-client
 * AC2 — every JSON mutation fetch wraps headers with csrfHeaders({ 'content-type': ... })
 * AC3 — FormData upload at activities/[id]/edit/page.tsx uses headers: csrfHeaders() (no content-type arg)
 * AC4 — settings/security page ONLY changes are headers addition (behavior unchanged)
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

function assertImportsCsrfHeaders(src, label) {
  assert.match(
    src,
    /import\s*\{[^}]*csrfHeaders[^}]*\}\s*from\s*['"][^'"]*csrf-client['"]/,
    `${label}: must import csrfHeaders from csrf-client`
  );
}

function assertMethodHasCsrf(src, method, label) {
  const hasWithCsrf =
    new RegExp(`method:\\s*['"]${method}['"][\\s\\S]{0,300}csrfHeaders\\s*\\(`, 'm').test(src) ||
    new RegExp(`csrfHeaders\\s*\\([\\s\\S]{0,300}method:\\s*['"]${method}['"]`, 'm').test(src);
  assert.ok(hasWithCsrf, `${label}: ${method} fetch must include csrfHeaders(...)`);
}

// ---------------------------------------------------------------------------
// 1 & 2 — app/(non-locale)/admin/activities/[id]/edit/page.tsx
// ---------------------------------------------------------------------------
describe('Site 1 & 2: app/(non-locale)/admin/activities/[id]/edit/page.tsx', () => {
  const FILE = 'app/(non-locale)/admin/activities/[id]/edit/page.tsx';

  it('imports csrfHeaders from csrf-client', () => {
    assertImportsCsrfHeaders(readFile(FILE), FILE);
  });

  it('FormData POST upload-image uses csrfHeaders() (no content-type arg)', () => {
    const src = readFile(FILE);
    // Must have csrfHeaders() within 300 chars of the upload-image POST
    const hasFormDataCsrf =
      /upload-image[\s\S]{0,300}csrfHeaders\s*\(\s*\)/m.test(src) ||
      /csrfHeaders\s*\(\s*\)[\s\S]{0,300}upload-image/m.test(src);
    assert.ok(hasFormDataCsrf, `${FILE}: FormData POST to upload-image must use csrfHeaders() with no args`);
  });

  it('DELETE schedule uses csrfHeaders()', () => {
    // #1615 拆檔：場次管理（含 DELETE schedule）移至 ScheduleSection 元件（斷言意圖不變）
    const SCHEDULE_SECTION = 'src/components/admin/activity-form/ScheduleSection.tsx';
    assertMethodHasCsrf(readFile(SCHEDULE_SECTION), 'DELETE', SCHEDULE_SECTION);
  });
});

// ---------------------------------------------------------------------------
// 3 — app/(non-locale)/admin/activities/[id]/plans/page.tsx
// ---------------------------------------------------------------------------
describe('Site 3: app/(non-locale)/admin/activities/[id]/plans/page.tsx', () => {
  const FILE = 'app/(non-locale)/admin/activities/[id]/plans/page.tsx';

  it('imports csrfHeaders from csrf-client', () => {
    assertImportsCsrfHeaders(readFile(FILE), FILE);
  });

  it('DELETE plan uses csrfHeaders()', () => {
    assertMethodHasCsrf(readFile(FILE), 'DELETE', FILE);
  });
});

// ---------------------------------------------------------------------------
// 4 — app/(non-locale)/admin/activities/page.tsx
// ---------------------------------------------------------------------------
describe('Site 4: app/(non-locale)/admin/activities/page.tsx', () => {
  const FILE = 'app/(non-locale)/admin/activities/page.tsx';

  it('imports csrfHeaders from csrf-client', () => {
    assertImportsCsrfHeaders(readFile(FILE), FILE);
  });

  it('DELETE activity uses csrfHeaders()', () => {
    assertMethodHasCsrf(readFile(FILE), 'DELETE', FILE);
  });
});

// ---------------------------------------------------------------------------
// 5 & 6 — app/(non-locale)/admin/guides/[guideId]/availability/page.tsx
// ---------------------------------------------------------------------------
describe('Site 5 & 6: app/(non-locale)/admin/guides/[guideId]/availability/page.tsx', () => {
  const FILE = 'app/(non-locale)/admin/guides/[guideId]/availability/page.tsx';

  it('imports csrfHeaders from csrf-client', () => {
    assertImportsCsrfHeaders(readFile(FILE), FILE);
  });

  it('DELETE availability-rule uses csrfHeaders()', () => {
    const src = readFile(FILE);
    const hasRuleDelete =
      /availability-rules[\s\S]{0,300}method:\s*['"]DELETE['"][\s\S]{0,300}csrfHeaders/m.test(src) ||
      /csrfHeaders\s*\(\s*\)[\s\S]{0,300}availability-rules/m.test(src);
    assert.ok(hasRuleDelete, `${FILE}: DELETE availability-rules must use csrfHeaders()`);
  });

  it('DELETE blackout-date uses csrfHeaders()', () => {
    const src = readFile(FILE);
    const hasBlackoutDelete =
      /blackout-dates[\s\S]{0,300}method:\s*['"]DELETE['"][\s\S]{0,300}csrfHeaders/m.test(src) ||
      /csrfHeaders\s*\(\s*\)[\s\S]{0,300}blackout-dates/m.test(src);
    assert.ok(hasBlackoutDelete, `${FILE}: DELETE blackout-dates must use csrfHeaders()`);
  });
});

// ---------------------------------------------------------------------------
// 7 — app/(non-locale)/admin/guides/page.tsx
// ---------------------------------------------------------------------------
describe('Site 7: app/(non-locale)/admin/guides/page.tsx', () => {
  const FILE = 'app/(non-locale)/admin/guides/page.tsx';

  it('imports csrfHeaders from csrf-client', () => {
    assertImportsCsrfHeaders(readFile(FILE), FILE);
  });

  it('POST invite uses csrfHeaders()', () => {
    const src = readFile(FILE);
    const hasInvitePost =
      /invite[\s\S]{0,300}method:\s*['"]POST['"][\s\S]{0,300}csrfHeaders/m.test(src) ||
      /csrfHeaders\s*\(\s*\)[\s\S]{0,300}invite/m.test(src) ||
      /invite[\s\S]{0,300}csrfHeaders\s*\(\s*\)/m.test(src);
    assert.ok(hasInvitePost, `${FILE}: POST to /invite must use csrfHeaders()`);
  });
});

// ---------------------------------------------------------------------------
// 8 — app/(non-locale)/admin/operations-tracking/page.tsx
// ---------------------------------------------------------------------------
describe('Site 8: app/(non-locale)/admin/operations-tracking/page.tsx', () => {
  const FILE = 'app/(non-locale)/admin/operations-tracking/page.tsx';

  it('imports csrfHeaders from csrf-client', () => {
    assertImportsCsrfHeaders(readFile(FILE), FILE);
  });

  it('PATCH operations-tracking uses csrfHeaders({ content-type: application/json })', () => {
    const src = readFile(FILE);
    assert.match(
      src,
      /csrfHeaders\s*\(\s*\{[^}]*content-type[^}]*\}\s*\)/,
      `${FILE}: PATCH must use csrfHeaders({ 'content-type': 'application/json' })`
    );
  });
});

// ---------------------------------------------------------------------------
// 9 & 10 — app/(non-locale)/admin/settings/kpi/page.tsx
// ---------------------------------------------------------------------------
describe('Site 9 & 10: app/(non-locale)/admin/settings/kpi/page.tsx', () => {
  const FILE = 'app/(non-locale)/admin/settings/kpi/page.tsx';

  it('imports csrfHeaders from csrf-client', () => {
    assertImportsCsrfHeaders(readFile(FILE), FILE);
  });

  it('PATCH kpi settings uses csrfHeaders({ content-type: application/json })', () => {
    const src = readFile(FILE);
    const hasKpiPatch =
      /method:\s*['"]PATCH['"][\s\S]{0,300}csrfHeaders\s*\(/m.test(src) ||
      /csrfHeaders\s*\([\s\S]{0,300}method:\s*['"]PATCH['"]/m.test(src);
    assert.ok(hasKpiPatch, `${FILE}: PATCH must use csrfHeaders(...)`);
  });

  it('POST kpi revert uses csrfHeaders({ content-type: application/json })', () => {
    const src = readFile(FILE);
    const hasKpiPost =
      /method:\s*['"]POST['"][\s\S]{0,300}csrfHeaders\s*\(/m.test(src) ||
      /csrfHeaders\s*\([\s\S]{0,300}method:\s*['"]POST['"]/m.test(src);
    assert.ok(hasKpiPost, `${FILE}: POST must use csrfHeaders(...)`);
  });

  it('csrfHeaders wraps content-type for JSON mutations', () => {
    const src = readFile(FILE);
    assert.match(
      src,
      /csrfHeaders\s*\(\s*\{[^}]*content-type[^}]*\}\s*\)/,
      `${FILE}: csrfHeaders must be called with { 'content-type': 'application/json' }`
    );
  });
});

// ---------------------------------------------------------------------------
// 11 & 12 — app/(non-locale)/admin/settings/security/page.tsx
// ---------------------------------------------------------------------------
describe('Site 11 & 12: app/(non-locale)/admin/settings/security/page.tsx', () => {
  const FILE = 'app/(non-locale)/admin/settings/security/page.tsx';

  it('imports csrfHeaders from csrf-client', () => {
    assertImportsCsrfHeaders(readFile(FILE), FILE);
  });

  it('POST rotate token uses csrfHeaders({ content-type: application/json })', () => {
    const src = readFile(FILE);
    const hasRotatePost =
      /auth\/security[\s\S]{0,300}method:\s*['"]POST['"][\s\S]{0,300}csrfHeaders/m.test(src) ||
      /csrfHeaders\s*\(\s*\{[^}]*content-type[^}]*\}[\s\S]{0,300}auth\/security/m.test(src) ||
      /auth\/security[\s\S]{0,300}csrfHeaders\s*\(/m.test(src);
    assert.ok(hasRotatePost, `${FILE}: POST to auth/security must use csrfHeaders(...)`);
  });

  it('POST force-logout-all uses csrfHeaders()', () => {
    const src = readFile(FILE);
    const hasForceLogout =
      /force-logout-all[\s\S]{0,300}csrfHeaders/m.test(src) ||
      /csrfHeaders[\s\S]{0,300}force-logout-all/m.test(src);
    assert.ok(hasForceLogout, `${FILE}: POST to force-logout-all must use csrfHeaders()`);
  });

  it('page still contains rotate and forceLogoutAll functions (behavior unchanged)', () => {
    const src = readFile(FILE);
    assert.match(src, /async function rotate\s*\(/, `${FILE}: rotate function must still exist`);
    assert.match(src, /async function forceLogoutAll\s*\(/, `${FILE}: forceLogoutAll function must still exist`);
  });
});

// ---------------------------------------------------------------------------
// 13 — app/(non-locale)/admin/promo-codes/page.tsx
// ---------------------------------------------------------------------------
describe('Site 13: app/(non-locale)/admin/promo-codes/page.tsx', () => {
  const FILE = 'app/(non-locale)/admin/promo-codes/page.tsx';

  it('imports csrfHeaders from csrf-client', () => {
    assertImportsCsrfHeaders(readFile(FILE), FILE);
  });

  it('DELETE promo-code uses csrfHeaders()', () => {
    assertMethodHasCsrf(readFile(FILE), 'DELETE', FILE);
  });
});

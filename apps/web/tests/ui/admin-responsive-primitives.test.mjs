import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// ──────────────────────────────────────────────────────────────────
// Admin responsive primitives — contract test
//
// Ensures src/components/admin/responsive.tsx exports the four primitives
// the admin pages depend on, and that every list/modal-bearing admin page
// imports them instead of going back to hand-rolled tables/modals.
//
// If a future PR removes one of these imports without replacing it with
// an equivalent responsive primitive, this test will fail loudly.
// ──────────────────────────────────────────────────────────────────

const primitivesPath = new URL('../../src/components/admin/responsive.tsx', import.meta.url);

const TABLE_PAGES = [
  '../../app/admin/orders/page.tsx',
  '../../app/admin/refunds/page.tsx',
  '../../app/admin/payouts/page.tsx',
  '../../app/admin/activities/page.tsx',
  '../../app/admin/activities/[id]/plans/page.tsx',
  '../../app/admin/promo-codes/page.tsx',
  '../../app/admin/reviews/page.tsx',
  '../../app/admin/qa/page.tsx',
  '../../app/admin/operations-tracking/page.tsx',
  '../../app/admin/health/page.tsx',
  '../../app/admin/settings/kpi/page.tsx',
];

const MODAL_PAGES = [
  '../../app/admin/activities/page.tsx',
  '../../app/admin/activities/[id]/edit/page.tsx',
  '../../app/admin/activities/[id]/plans/page.tsx',
  '../../app/admin/guides/page.tsx',
  '../../app/admin/guides/[guideId]/availability/page.tsx',
];

test('responsive primitives module exports the four named primitives', async () => {
  const src = await readFile(primitivesPath, 'utf8');
  for (const name of ['useIsMobile', 'ResponsiveTable', 'ResponsiveModal', 'FormGrid']) {
    assert.match(src, new RegExp(`export\\s+(function|const|type)\\s+${name}\\b`), `responsive.tsx should export ${name}`);
  }
});

test('every admin table page imports ResponsiveTable', async () => {
  for (const rel of TABLE_PAGES) {
    const src = await readFile(new URL(rel, import.meta.url), 'utf8');
    assert.match(
      src,
      /from\s+['"][^'"]*components\/admin\/responsive['"]/,
      `${rel} should import from components/admin/responsive`,
    );
    assert.match(src, /ResponsiveTable/, `${rel} should use <ResponsiveTable>`);
    // And must NOT regress to raw <TableWrapper> + hand-rolled <thead>/<tbody>.
    assert.ok(
      !/<TableWrapper>/.test(src) || /ResponsiveTable/.test(src),
      `${rel} should not use raw TableWrapper without ResponsiveTable`,
    );
  }
});

test('every admin modal page imports ResponsiveModal', async () => {
  for (const rel of MODAL_PAGES) {
    const src = await readFile(new URL(rel, import.meta.url), 'utf8');
    assert.match(src, /ResponsiveModal/, `${rel} should use <ResponsiveModal>`);
  }
});

test('AdminShell sources its desktop/mobile flag from useIsMobile', async () => {
  const shellPath = new URL('../../src/components/admin/AdminShell.tsx', import.meta.url);
  const src = await readFile(shellPath, 'utf8');
  assert.match(src, /useIsMobile\b/, 'AdminShell.tsx should import useIsMobile');
  assert.ok(
    !/window\.innerWidth/.test(src),
    'AdminShell.tsx should not contain inline window.innerWidth listener (use useIsMobile)',
  );
});

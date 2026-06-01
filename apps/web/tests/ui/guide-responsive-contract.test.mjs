// Locks in the guide back-office RWD overhaul:
//   - the four admin responsive primitives stay parametrized by CSS vars
//     so the guide subtree can render its purple accent;
//   - guide/layout.tsx sets that purple accent + closes the mobile dropdown
//     on route change + honors iPhone safe-area-inset-bottom;
//   - each guide table/modal page actually imports from the shared
//     components/admin/responsive module (no regression to inline tables);
//   - no fixed-width modal pattern (position:fixed + inset:0 + maxWidth)
//     remains anywhere under app/guide/**.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function readSrc(rel) {
  return readFile(path.join(WEB_ROOT, rel), 'utf8');
}

test('ResponsiveTable selected-row colors are parametrized via CSS vars (--rt-accent[-soft])', async () => {
  const src = await readSrc('src/components/admin/responsive.tsx');
  // Both occurrences (desktop <tr> + mobile card) use the soft fallback.
  assert.match(src, /var\(--rt-accent-soft,\s*#f0fdf4\)/);
  // Mobile-card left border falls back to var(--tp-primary).
  assert.match(src, /3px solid var\(--rt-accent,\s*var\(--tp-primary\)\)/);
});

test('guide layout sets the purple accent vars + closes dropdown on route change + safe-area', async () => {
  const src = await readSrc('app/guide/layout.tsx');
  assert.match(src, /--rt-accent[\s\S]*?'#7c3aed'/);
  assert.match(src, /--rt-accent-soft[\s\S]*?'#f5f3ff'/);
  // Effect that closes the menu when pathname changes.
  assert.match(src, /setMenuOpen\(false\)/);
  assert.match(src, /\[pathname\]/);
  // iPhone safe area on bottom bar / main padding.
  assert.match(src, /env\(safe-area-inset-bottom\)/);
});

const GUIDE_TABLE_PAGES = [
  'app/guide/bookings/page.tsx',
  'app/guide/schedules/page.tsx',
  'app/guide/dashboard/page.tsx',
];
for (const rel of GUIDE_TABLE_PAGES) {
  test(`${rel} imports ResponsiveTable from components/admin/responsive`, async () => {
    const src = await readSrc(rel);
    assert.match(src, /from\s+['"][^'"]*components\/admin\/responsive['"]/);
    assert.match(src, /\bResponsiveTable\b/);
  });
}

const GUIDE_MODAL_PAGES = [
  'app/guide/bookings/page.tsx',
  'app/guide/dashboard/page.tsx',
  'app/guide/availability/page.tsx',
];
for (const rel of GUIDE_MODAL_PAGES) {
  test(`${rel} uses ResponsiveModal (no hand-rolled fixed overlay)`, async () => {
    const src = await readSrc(rel);
    assert.match(src, /\bResponsiveModal\b/);
  });
}

test('no fixed-width hand-rolled modal remains under app/guide/**', async () => {
  // Walk app/guide for .tsx files; assert none combine `position: 'fixed'`
  // with `inset: 0` and a literal maxWidth (the legacy modal pattern).
  const guideRoot = path.join(WEB_ROOT, 'app/guide');
  const tsxFiles = await walkTsx(guideRoot);
  const offenders = [];
  for (const abs of tsxFiles) {
    const src = await readFile(abs, 'utf8');
    // Heuristic: a single style object that opens with position:'fixed',
    // contains inset:0, and contains maxWidth: <number>. The hand-rolled
    // overlay always sits within the same {{ ... }} block.
    const re = /position:\s*['"]fixed['"][^{}]*?inset:\s*0[^{}]*?maxWidth:\s*\d/g;
    if (re.test(src)) offenders.push(path.relative(WEB_ROOT, abs));
  }
  assert.deepEqual(offenders, [], `guide pages must not use hand-rolled fixed-width modals: ${offenders.join(', ')}`);
});

async function walkTsx(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkTsx(abs)));
    else if (entry.isFile() && abs.endsWith('.tsx')) out.push(abs);
  }
  return out;
}

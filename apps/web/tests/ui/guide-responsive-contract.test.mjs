// Locks in the guide back-office RWD overhaul:
//   - the four admin responsive primitives stay parametrized by CSS vars
//     so the guide subtree can render its purple accent;
//   - guide/layout.tsx sets that purple accent + closes the mobile dropdown
//     on route change + honors iPhone safe-area-inset-bottom;
//   - each guide table/modal page actually imports from the shared
//     components/admin/responsive module (no regression to inline tables);
//   - no fixed-width modal pattern (position:fixed + inset:0 + maxWidth)
//     remains anywhere under app/(non-locale)/guide/** EXCEPT bookings, which keeps a
//     hand-rolled focus-trapped dialog to stay compatible with PR #1066's
//     a11y suite — there we instead assert the panel sizing is RWD-friendly.
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
  const src = await readSrc('app/(non-locale)/guide/layout.tsx');
  assert.match(src, /--rt-accent[\s\S]*?'#7c3aed'/);
  assert.match(src, /--rt-accent-soft[\s\S]*?'#f5f3ff'/);
  // Effect that closes the menu when pathname changes.
  assert.match(src, /setMenuOpen\(false\)/);
  assert.match(src, /\[pathname\]/);
  // iPhone safe area on bottom bar / main padding.
  assert.match(src, /env\(safe-area-inset-bottom\)/);
});

const GUIDE_TABLE_PAGES = [
  'app/(non-locale)/guide/bookings/page.tsx',
  'app/(non-locale)/guide/schedules/page.tsx',
  'app/(non-locale)/guide/dashboard/page.tsx',
];
for (const rel of GUIDE_TABLE_PAGES) {
  test(`${rel} imports ResponsiveTable from components/admin/responsive`, async () => {
    const src = await readSrc(rel);
    assert.match(src, /from\s+['"][^'"]*components\/admin\/responsive['"]/);
    assert.match(src, /\bResponsiveTable\b/);
  });
}

// dashboard + availability use ResponsiveModal. bookings stays hand-rolled
// because PR #1066's a11y suite source-greps for dialogRef / closeButtonRef
// and the literal role="dialog" markup — moving it into ResponsiveModal
// would break that contract. The hand-rolled bookings panel is still RWD,
// asserted separately below.
const GUIDE_MODAL_PAGES = [
  'app/(non-locale)/guide/dashboard/page.tsx',
  'app/(non-locale)/guide/availability/page.tsx',
];
for (const rel of GUIDE_MODAL_PAGES) {
  test(`${rel} uses ResponsiveModal (no hand-rolled fixed overlay)`, async () => {
    const src = await readSrc(rel);
    assert.match(src, /\bResponsiveModal\b/);
  });
}

test('bookings hand-rolled dialog panel is RWD-friendly (width clamps to viewport)', async () => {
  // Asserts the panel width is `min(<px>, calc(100vw - <px>))` and that
  // maxHeight uses 100dvh so the modal never overflows a 375-wide phone.
  const src = await readSrc('app/(non-locale)/guide/bookings/page.tsx');
  assert.match(src, /width:\s*'min\(\d+px,\s*calc\(100vw - \d+px\)\)'/);
  assert.match(src, /maxHeight:\s*'calc\(100dvh - \d+px\)'/);
});

test('no fixed-width hand-rolled modal remains in non-bookings app/(non-locale)/guide/** pages', async () => {
  // bookings/page.tsx is intentionally excluded — see the test above.
  const guideRoot = path.join(WEB_ROOT, 'app/(non-locale)/guide');
  const tsxFiles = (await walkTsx(guideRoot)).filter(
    (abs) => !abs.endsWith(path.join('app/(non-locale)/guide/bookings/page.tsx')),
  );
  const offenders = [];
  for (const abs of tsxFiles) {
    const src = await readFile(abs, 'utf8');
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

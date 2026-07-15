import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';

// ──────────────────────────────────────────────────────────────────
// No-regress test: every admin/** page must not reintroduce a fixed
// modal/dialog width pattern that breaks on 320–414px viewports.
//
// Allowed: viewport-bounded sizes via ResponsiveModal (handled in the
// primitive), or `width: 100%`, or input/element sizes (<= 200px).
//
// Disallowed at the page level:
//   - `width: 400`..`width: 599` numeric literals
//   - `maxWidth: 400`..`maxWidth: 599` numeric literals
//   - `width: '90%'` paired with `maxWidth: <NN>0` (the legacy modal pattern)
// ──────────────────────────────────────────────────────────────────

const ADMIN_DIR = new URL('../../app/(non-locale)/admin/', import.meta.url);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) yield* walk(url);
    else if (entry.name.endsWith('.tsx')) yield url;
  }
}

test('admin pages contain no fixed modal widths (bare width: 400–599)', async () => {
  // Bare `width: 480` (no `%`/`vw`) is the dangerous pattern — at 375px viewport
  // a 480px-wide modal overflows horizontally.
  //
  // Allowed: `maxWidth: 480` paired with `width: '100%'` (the panel shrinks),
  // or `width: 'min(...)' / calc(...)` (used inside ResponsiveModal itself).
  const offenders = [];
  for await (const fileUrl of walk(ADMIN_DIR)) {
    const src = await readFile(fileUrl, 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, idx) => {
      // bare numeric width literal 400..599 (no quotes, no calc/min/max)
      const m = line.match(/\bwidth:\s*([45]\d\d)\b(?!\s*px)/);
      if (m && !/['"]/.test(line.slice(line.indexOf(m[0]), line.indexOf(m[0]) + m[0].length + 2))) {
        offenders.push(`${fileUrl.pathname}:${idx + 1}  ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `Bare fixed modal widths found. Use ResponsiveModal (which clamps to min(SIZE, 100vw - 24px)), or pair maxWidth with width: '100%':\n${offenders.join('\n')}`,
  );
});

test('admin pages do not use the legacy "fixed-overlay + width: 90%" modal pattern', async () => {
  const offenders = [];
  for await (const fileUrl of walk(ADMIN_DIR)) {
    const src = await readFile(fileUrl, 'utf8');
    // Heuristic: a div with position: 'fixed' AND inset: 0 AND a child div
    // with maxWidth: <number> is the legacy hand-rolled modal pattern.
    // ResponsiveModal handles its own backdrop internally via .admin-modal-backdrop.
    if (
      /position:\s*['"]fixed['"]/.test(src) &&
      /inset:\s*0/.test(src) &&
      /max[Ww]idth:\s*\d{3}/.test(src) &&
      !/from\s+['"][^'"]*components\/admin\/responsive['"]/.test(src)
    ) {
      offenders.push(fileUrl.pathname);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Files appear to contain a hand-rolled fixed-overlay modal. Use <ResponsiveModal> from src/components/admin/responsive:\n${offenders.join('\n')}`,
  );
});

// Sanity: ensure the walker actually walked something.
test('walker enumerates at least a handful of admin pages', async () => {
  let count = 0;
  for await (const _ of walk(ADMIN_DIR)) count++;
  assert.ok(count > 15, `Expected to walk >15 admin pages, walked ${count}`);
  void stat; // keep import used (helps IDE)
});

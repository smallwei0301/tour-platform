// Issue #1113: every `role="tablist"` in apps/web/app must support
// ArrowRight/ArrowLeft keyboard navigation per the WAI-ARIA Tabs pattern.
// This test source-greps each affected file and accepts either form:
//   (a) imports the shared hook `useTablistKeyboard`, OR
//   (b) implements `ArrowRight` AND `ArrowLeft` inline (the orders/page.tsx
//       canonical reference does this).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function findTablistFiles() {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile() && abs.endsWith('.tsx')) {
        const src = await readFile(abs, 'utf8');
        if (src.includes('role="tablist"')) out.push(abs);
      }
    }
  }
  await walk(path.join(WEB_ROOT, 'app'));
  return out.sort();
}

test('the shared useTablistKeyboard hook exists and handles ArrowRight/ArrowLeft/Home/End', async () => {
  const src = await readFile(path.join(WEB_ROOT, 'src/lib/use-tablist-keyboard.ts'), 'utf8');
  assert.match(src, /export function useTablistKeyboard/);
  assert.match(src, /'ArrowRight'/);
  assert.match(src, /'ArrowLeft'/);
  assert.match(src, /'Home'/);
  assert.match(src, /'End'/);
  // Wraps around at the ends — modulo and `(idx - 1 + length) % length` pattern.
  assert.match(src, /%\s*values\.length/);
});

test('every role="tablist" page wires ArrowRight/ArrowLeft keyboard navigation', async () => {
  const files = await findTablistFiles();
  assert.ok(files.length >= 7, `expected to find at least 7 tablist pages, got ${files.length}`);

  const offenders = [];
  for (const abs of files) {
    const src = await readFile(abs, 'utf8');
    const usesHook = /\buseTablistKeyboard\b/.test(src);
    const inlineArrows = /['"]ArrowRight['"]/.test(src) && /['"]ArrowLeft['"]/.test(src);
    if (!usesHook && !inlineArrows) {
      offenders.push(path.relative(WEB_ROOT, abs));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these tablist pages support neither the shared hook nor inline ArrowRight/ArrowLeft handlers:\n  ${offenders.join('\n  ')}`,
  );
});

test('every role="tablist" page registers tab refs so focus can move with arrow keys', async () => {
  // A page that uses the hook must also pass refs via registerTab — otherwise
  // arrow keys change selection but don't move keyboard focus, breaking the
  // WAI-ARIA contract. Inline implementations (orders/page.tsx) are exempt;
  // they manage their own refs.
  const files = await findTablistFiles();
  const offenders = [];
  for (const abs of files) {
    const src = await readFile(abs, 'utf8');
    if (!/\buseTablistKeyboard\b/.test(src)) continue;
    if (!/registerTab\(/.test(src)) offenders.push(path.relative(WEB_ROOT, abs));
  }
  assert.deepEqual(
    offenders,
    [],
    `these pages call useTablistKeyboard but never wire registerTab:\n  ${offenders.join('\n  ')}`,
  );
});

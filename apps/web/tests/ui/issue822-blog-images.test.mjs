import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const KNOWN_BROKEN_UNSPLASH_IDS = ['1504699439244-a9a8618cafc6'];

const FILES = ['app/blog/page.tsx', 'src/components/home/ThemeCtas.tsx'];

test('issue #822: blog and theme do not reference known-broken Unsplash photo IDs', async () => {
  for (const rel of FILES) {
    const src = await readFile(path.join(ROOT, rel), 'utf8');
    for (const id of KNOWN_BROKEN_UNSPLASH_IDS) {
      assert.ok(
        !src.includes(id),
        `${rel} still references known-broken Unsplash photo ${id} (issue #822)`,
      );
    }
  }
});

test('issue #822: blog featured card uses responsive class instead of inline two-column grid', async () => {
  const src = await readFile(path.join(ROOT, 'app/blog/page.tsx'), 'utf8');
  assert.match(src, /className="tp-blog-featured"/, 'featured article should use .tp-blog-featured class');
  assert.ok(
    !/gridTemplateColumns:\s*['"]1\.2fr 1fr['"]/.test(src),
    'featured card should not use inline desktop-only gridTemplateColumns (regresses mobile stacking)',
  );
});

test('issue #822: .tp-blog-featured CSS stacks to single column on mobile', async () => {
  const css = await readFile(path.join(ROOT, 'app/globals.css'), 'utf8');
  assert.match(css, /\.tp-blog-featured\s*\{[^}]*grid-template-columns:\s*1\.2fr 1fr/);
  assert.match(
    css,
    /@media\s*\(max-width:\s*768px\)\s*\{[^}]*\.tp-blog-featured\s*\{[^}]*grid-template-columns:\s*1fr/s,
    'mobile breakpoint should collapse .tp-blog-featured to single column',
  );
});

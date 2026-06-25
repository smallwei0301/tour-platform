import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const blogPage = readFileSync(path.join(ROOT, 'app/[locale]/blog/page.tsx'), 'utf8');
const globalsCss = readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');

test('blog card grid uses tp-blog-grid modifier class', () => {
  assert.ok(blogPage.includes('tp-blog-grid'), 'blog page must use tp-blog-grid class on article grid');
});

test('tp-blog-grid uses auto-fit columns (expands lone card to full width)', () => {
  assert.ok(globalsCss.includes('tp-blog-grid') && globalsCss.includes('auto-fit'),
    'globals.css must define tp-blog-grid with auto-fit grid-template-columns');
});

test('tp-blog-grid is single-column on mobile (max-width 768px)', () => {
  // Check that within the mobile media query, tp-blog-grid has 1fr
  const mediaBlock = globalsCss.match(/@media\s*\(max-width:\s*768px\)[^}]*{([^{]*(?:{[^}]*}[^{]*)*)}/s)?.[1] || '';
  assert.ok(mediaBlock.includes('tp-blog-grid'), 'tp-blog-grid must appear in mobile media query');
});

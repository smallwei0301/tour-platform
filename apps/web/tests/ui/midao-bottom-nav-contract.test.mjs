import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(here, '../../src/features/midao/shell/MidaoBottomNav.tsx');
const cssPath = resolve(here, '../../src/features/midao/styles/shell.css');

test('bottom nav renders the one shared five-item model with semantic active state', () => {
  assert.equal(existsSync(componentPath), true);
  const source = readFileSync(componentPath, 'utf8');
  assert.match(source, /MIDAO_NAV_ITEMS\.map/u);
  assert.match(source, /activeMidaoNavId\(pathname\)/u);
  assert.match(source, /<nav[^>]*aria-label="Midao 主導航"/u);
  assert.match(source, /aria-current=\{activeId === item\.id \? 'page' : undefined\}/u);
  assert.match(source, /key=\{item\.id\}/u);
  assert.doesNotMatch(source, /const\s+(?:NAV|ITEMS)\s*=\s*\[/u);
});

test('bottom nav CSS is mobile-only, touch-safe and safe-area aware', () => {
  const css = readFileSync(cssPath, 'utf8');
  assert.match(css, /\.midao-bottom-nav\s*\{/u);
  assert.match(css, /position:\s*fixed/u);
  assert.match(css, /padding-bottom:\s*var\(--midao-safe-area-bottom\)/u);
  assert.match(css, /\.midao-bottom-nav__item[^}]*min-height:\s*var\(--midao-target-min\)/su);
  assert.match(css, /@media\s*\(min-width:\s*768px\)[^{]*\{[^}]*\.midao-bottom-nav[^}]*display:\s*none/su);
});

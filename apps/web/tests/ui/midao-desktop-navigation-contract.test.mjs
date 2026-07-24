import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sidebar = readFileSync(resolve(root, 'src/features/midao/shell/MidaoDesktopSidebar.tsx'), 'utf8');
const header = readFileSync(resolve(root, 'src/features/midao/shell/MidaoPageHeader.tsx'), 'utf8');

test('desktop sidebar uses the one canonical nav model and semantic active navigation', () => {
  assert.match(sidebar, /MIDAO_NAV_ITEMS/u);
  assert.match(sidebar, /activeMidaoNavId/u);
  assert.match(sidebar, /<aside/u);
  assert.match(sidebar, /<nav[^>]+aria-label=/u);
  assert.match(sidebar, /aria-current=/u);
  assert.doesNotMatch(sidebar, /\[\s*\{[^\]]+href:\s*['"]\/midao/u);
  assert.match(sidebar, /midao-desktop-sidebar/u);
});

test('page header exposes title subtitle and action slots', () => {
  for (const value of ['title', 'subtitle', 'action', 'midao-page-header']) {
    assert.ok(header.includes(value), `header missing ${value}`);
  }
  assert.match(header, /<header/u);
  assert.match(header, /<h1/u);
});

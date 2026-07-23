import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tokenPath = resolve(here, '../../src/features/midao/styles/tokens.css');
const shellPath = resolve(here, '../../src/features/midao/styles/shell.css');

test('Midao tokens use the approved Brand Book palette and heading face', () => {
  assert.equal(existsSync(tokenPath), true);
  const css = readFileSync(tokenPath, 'utf8');
  for (const color of ['#1A2E1F', '#F4ECD8', '#EBE1C7', '#C2542E', '#5E7A4F']) assert.match(css, new RegExp(color, 'i'));
  assert.match(css, /--midao-color-ink:\s*#1A2E1F/iu);
  assert.match(css, /--midao-color-page:\s*#F4ECD8/iu);
  assert.match(css, /--midao-color-alert:\s*#C2542E/iu);
  assert.match(css, /--midao-color-success:\s*#5E7A4F/iu);
  assert.match(css, /Noto Serif TC/iu);
  assert.doesNotMatch(css, /--midao-color-(?:primary|active):\s*#[0-9a-f]*ff/iu);
});

test('shell accessibility tokens cover safe areas, touch targets, focus and reduced motion', () => {
  assert.equal(existsSync(shellPath), true);
  const css = `${readFileSync(tokenPath, 'utf8')}\n${readFileSync(shellPath, 'utf8')}`;
  assert.match(css, /env\(safe-area-inset-bottom[^)]*\)/u);
  assert.match(css, /--midao-target-min:\s*44px/u);
  assert.match(css, /min-(?:height|width):\s*var\(--midao-target-min\)/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
});

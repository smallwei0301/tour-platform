/**
 * GH-1088 — AdminShell and guide/layout nav surfaces must expose aria-current on active state.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const adminShell = readFileSync(resolve(__dirname, '../../src/components/admin/AdminShell.tsx'), 'utf8');
const guideLayout = readFileSync(resolve(__dirname, '../../app/(non-locale)/guide/layout.tsx'), 'utf8');

describe('GH-1088 — nav aria-current on active state', () => {
  test('AdminShell nav Link has aria-current', () => {
    assert.ok(
      adminShell.includes('aria-current'),
      'AdminShell.tsx must include aria-current on active nav Link'
    );
  });
  test('guide/layout has aria-current on all 3 nav surfaces', () => {
    const matches = guideLayout.match(/aria-current/g) ?? [];
    assert.ok(
      matches.length >= 3,
      `guide/layout.tsx must have aria-current on 3 nav surfaces, found ${matches.length}`
    );
  });
});

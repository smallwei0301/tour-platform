/**
 * GH-960 slice 2 — Activity detail section anchor keyboard/a11y contract.
 *
 * Source-level guard: section nav must expose tab semantics and keyboard controls.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, '../../src/components/activity/SectionAnchorNav.tsx'),
  'utf8'
);

describe('GH-960 — SectionAnchorNav accessibility tab keyboard contract', () => {
  test('exposes tablist and tab semantics with selected state', () => {
    assert.ok(source.includes('role="tablist"'), 'nav should expose role="tablist"');
    assert.ok(source.includes('role="tab"'), 'buttons should expose role="tab"');
    assert.ok(source.includes('aria-selected={active === id}'), 'tabs should expose aria-selected state');
  });

  test('supports arrow key roving plus Enter/Space activation', () => {
    assert.ok(source.includes('onKeyDown={'), 'tabs should handle keyboard keydown');
    assert.ok(source.includes("event.key === 'ArrowRight'"), 'should handle ArrowRight');
    assert.ok(source.includes("event.key === 'ArrowLeft'"), 'should handle ArrowLeft');
    assert.ok(source.includes("event.key === 'Enter'"), 'should handle Enter activation');
    assert.ok(source.includes("event.key === ' '"), 'should handle Space activation');
  });
});

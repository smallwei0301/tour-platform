/**
 * GH-1085 — guide/dashboard must have exactly one h1 and a descriptive aria-label on the welcome banner close button.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../../app/(non-locale)/guide/dashboard/page.tsx'), 'utf8');

describe('GH-1085 — guide dashboard a11y', () => {
  test('page has exactly one h1 element', () => {
    const h1Matches = source.match(/<h1[\s>]/g) ?? [];
    assert.equal(h1Matches.length, 1, `Expected exactly 1 h1, found ${h1Matches.length}`);
  });
  test('welcome banner close button has aria-label', () => {
    assert.ok(
      source.includes('aria-label="關閉歡迎訊息"'),
      'Welcome banner close button must have aria-label="關閉歡迎訊息"'
    );
  });
});

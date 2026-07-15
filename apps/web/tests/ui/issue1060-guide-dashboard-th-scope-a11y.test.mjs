/**
 * GH-1060 — Guide dashboard table headers must expose scope="col".
 *
 * Source-level static guard: every <th> in guide/dashboard/page.tsx
 * must carry scope="col" so screen readers can identify column headers.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, '../../app/(non-locale)/guide/dashboard/page.tsx'),
  'utf8'
);

describe('GH-1060 — guide dashboard table headers expose scope=col', () => {
  test('every <th> tag includes scope="col"', () => {
    const thTagRegex = /<th(\s[^>]*)?>/g;
    const offending = [];
    let match;
    while ((match = thTagRegex.exec(source)) !== null) {
      const tag = match[0];
      if (!tag.includes('scope="col"')) {
        offending.push(tag);
      }
    }
    assert.deepEqual(
      offending,
      [],
      `The following <th> tags are missing scope="col":\n${offending.join('\n')}`
    );
  });
});

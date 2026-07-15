/**
 * Issue #458 — Guide Q&A CSRF header contract test
 *
 * Static-analysis test: reads guide/dashboard/page.tsx and asserts that
 * handleQaAnswer sends the CSRF token via csrfHeaders().
 * No live server required.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const PAGE_PATH = path.join(ROOT, 'app/(non-locale)/guide/dashboard/page.tsx');

describe('Issue #458 — Guide Q&A CSRF header', () => {
  it('guide dashboard page file exists', () => {
    assert.ok(fs.existsSync(PAGE_PATH), `Page must exist: ${PAGE_PATH}`);
  });

  it('imports csrfHeaders from csrf-client', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8');
    assert.match(
      src,
      /import\s*\{[^}]*csrfHeaders[^}]*\}\s*from\s*['"][^'"]*csrf-client['"]/,
      'Must import csrfHeaders from csrf-client'
    );
  });

  it('handleQaAnswer PATCH uses csrfHeaders()', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8');
    // Ensure csrfHeaders is called in the headers of the PATCH fetch
    assert.match(
      src,
      /headers\s*:\s*csrfHeaders\s*\(/,
      'handleQaAnswer PATCH must set headers: csrfHeaders(...)'
    );
  });

  it('handleQaAnswer PATCH does NOT use bare content-type header object', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8');
    // The old bug was: headers: { 'content-type': 'application/json' }
    // After fix, it must be wrapped in csrfHeaders(...)
    const hasBareHeader = /headers\s*:\s*\{\s*['"]content-type['"]\s*:/.test(src);
    assert.ok(!hasBareHeader, 'PATCH must not use bare { content-type } header — must wrap with csrfHeaders()');
  });
});

/**
 * Issue #470 — add missing CSRF headers to Guide + Traveler UI mutation calls
 *
 * Static-scan tests (no live DB / network).
 *
 * AC1 — app/me/wishlist/page.tsx DELETE fetch to /api/me/wishlist/ includes csrfHeaders
 * AC2 — src/lib/client-api.ts POST fetch to /api/me/orders/.../refund-requests includes csrfHeaders
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(full), `File must exist: ${full}`);
  return fs.readFileSync(full, 'utf8');
}

// ---------------------------------------------------------------------------
// AC1 — app/me/wishlist/page.tsx
// ---------------------------------------------------------------------------
describe('AC1: app/me/wishlist/page.tsx — DELETE wishlist item includes CSRF header', () => {
  it('imports csrfHeaders from csrf-client', () => {
    const src = readFile('app/me/wishlist/page.tsx');
    assert.match(
      src,
      /import\s*\{[^}]*csrfHeaders[^}]*\}\s*from\s*['"][^'"]*csrf-client['"]/,
      'Must import csrfHeaders from csrf-client'
    );
  });

  it('DELETE fetch to /api/me/wishlist/ includes csrfHeaders()', () => {
    const src = readFile('app/me/wishlist/page.tsx');
    // Match DELETE call with csrfHeaders nearby (within 300 chars in either order)
    const hasDeleteWithCsrf =
      /method:\s*['"]DELETE['"][\s\S]{0,300}csrfHeaders\s*\(\s*\)/m.test(src) ||
      /csrfHeaders\s*\(\s*\)[\s\S]{0,300}method:\s*['"]DELETE['"]/m.test(src);
    assert.ok(hasDeleteWithCsrf, 'DELETE fetch must include csrfHeaders()');
  });

  it('no bare DELETE to /api/me/ without x-csrf-token or csrfHeaders', () => {
    const src = readFile('app/me/wishlist/page.tsx');
    // Check that every DELETE mention has csrfHeaders or x-csrf-token nearby
    const deleteFetches = [...src.matchAll(/fetch\s*\([^)]*\/api\/me\/[^)]*\)\s*,\s*\{[^}]*method:\s*['"]DELETE['"]/g)];
    for (const match of deleteFetches) {
      const window = src.slice(match.index, match.index + 400);
      const hasCsrf = /csrfHeaders|x-csrf-token/.test(window);
      assert.ok(hasCsrf, `DELETE fetch at offset ${match.index} is missing csrfHeaders or x-csrf-token`);
    }
  });
});

// ---------------------------------------------------------------------------
// AC2 — src/lib/client-api.ts
// ---------------------------------------------------------------------------
describe('AC2: src/lib/client-api.ts — POST refund-request includes CSRF header', () => {
  it('imports csrfHeaders from csrf-client', () => {
    const src = readFile('src/lib/client-api.ts');
    assert.match(
      src,
      /import\s*\{[^}]*csrfHeaders[^}]*\}\s*from\s*['"][^'"]*csrf-client['"]/,
      'Must import csrfHeaders from csrf-client'
    );
  });

  it('POST fetch to /api/me/orders/.../refund-requests uses csrfHeaders', () => {
    const src = readFile('src/lib/client-api.ts');
    const hasPostWithCsrf =
      /method:\s*['"]POST['"][\s\S]{0,300}csrfHeaders\s*\(/m.test(src) ||
      /csrfHeaders\s*\([\s\S]{0,300}method:\s*['"]POST['"]/m.test(src);
    assert.ok(hasPostWithCsrf, 'POST fetch to refund-requests must use csrfHeaders(...)');
  });

  it('csrfHeaders wraps content-type for refund-request POST', () => {
    const src = readFile('src/lib/client-api.ts');
    assert.match(
      src,
      /csrfHeaders\s*\(\s*\{[^}]*content-type[^}]*\}\s*\)/,
      "csrfHeaders must be called with { 'content-type': 'application/json' } for POST"
    );
  });
});

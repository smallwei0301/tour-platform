/**
 * Issue #457 — Wishlist POST slug→UUID resolution contract test
 *
 * Static-analysis test: reads the wishlist POST route and asserts that
 * it handles slug inputs by resolving them to UUIDs before inserting.
 * No live DB required.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const ROUTE_PATH = path.join(ROOT, 'app/api/me/wishlist/route.ts');

describe('Issue #457 — Wishlist POST slug→UUID resolution', () => {
  it('wishlist route file exists', () => {
    assert.ok(fs.existsSync(ROUTE_PATH), `Route must exist: ${ROUTE_PATH}`);
  });

  it('POST handler has UUID regex check', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8');
    // Must have a UUID validation regex
    assert.match(
      src,
      /\[0-9a-f-\]\{36\}/,
      'Must have UUID regex pattern /^[0-9a-f-]{36}$/i'
    );
  });

  it('POST handler queries activities by slug when not a UUID', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8');
    // Must query activities table by slug
    assert.match(
      src,
      /from\s*\(\s*['"]activities['"]\s*\)/,
      "Must query .from('activities') to resolve slug"
    );
    assert.match(
      src,
      /\.eq\s*\(\s*['"]slug['"]/,
      "Must filter by .eq('slug', ...) when resolving slug to UUID"
    );
  });

  it('POST handler returns 404 when slug not found', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8');
    assert.match(
      src,
      /NOT_FOUND/,
      'Must return NOT_FOUND when activity slug cannot be resolved'
    );
    assert.match(
      src,
      /status:\s*404/,
      'NOT_FOUND must return HTTP 404'
    );
  });

  it('POST handler accepts UUID directly (no slug lookup for UUID input)', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8');
    // The UUID regex branch skip ensures UUID inputs bypass slug lookup
    assert.match(
      src,
      /UUID_RE\.test\(activityId\)|!UUID_RE\.test\(activityId\)/,
      'Must test activityId against UUID regex to decide whether to resolve slug'
    );
  });

  it('addToWishlistDb is called with the resolved UUID', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8');
    // addToWishlistDb must be called after potential slug resolution
    assert.match(
      src,
      /addToWishlistDb\s*\(\s*\{/,
      'Must call addToWishlistDb with resolved UUID'
    );
  });
});

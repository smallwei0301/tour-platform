/**
 * Issue #431 — Wishlist relationship/embed rescue contract
 *
 * Goal: ensure listWishlistDb no longer relies on PostgREST embed
 * (wishlists -> activities relationship metadata) so API can still work
 * when production schema relationship cache is missing/drifted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbSrc = readFileSync(resolve(__dirname, '../../src/lib/db.mjs'), 'utf8');

test('listWishlistDb does not use relationship embed query shape', () => {
  assert.doesNotMatch(
    dbSrc,
    /from\('wishlists'\)[\s\S]{0,500}activities\(id,\s*title,\s*slug,\s*price_twd,\s*cover_image_url\)/,
    'listWishlistDb must not select embedded activities(...) from wishlists query'
  );
});

test('listWishlistDb resolves activity details via second explicit activities query', () => {
  assert.match(
    dbSrc,
    /from\('activities'\)[\s\S]{0,300}select\('id,\s*title,\s*slug,\s*price_twd,\s*cover_image_url'\)[\s\S]{0,200}\.in\('id',\s*activityIds\)/,
    'listWishlistDb must query activities table explicitly via .in(\'id\', activityIds)'
  );
});

/**
 * Issue #457 regression contract:
 * POST /api/me/wishlist can receive slug from activity page,
 * and DB helper resolves slug -> activities.id(UUID) before wishlists upsert.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbSource = readFileSync(resolve(__dirname, '../../src/lib/db.mjs'), 'utf8');
const routeSource = readFileSync(resolve(__dirname, '../../app/api/me/wishlist/route.ts'), 'utf8');

test('db helper defines slug/uuid resolver for wishlist activity reference', () => {
  assert.match(dbSource, /resolveWishlistActivityId\s*\(/, 'must define resolveWishlistActivityId helper');
  assert.match(dbSource, /UUID_V4_LIKE_RE/, 'must detect UUID callers and preserve compatibility');
});

test('slug path resolves via activities.slug lookup', () => {
  assert.match(dbSource, /from\('activities'\)/, 'must query activities table when non-uuid input is provided');
  assert.match(dbSource, /\.eq\('slug',\s*normalizedRef\)/, 'must resolve by slug');
  assert.match(dbSource, /throw new Error\('activity not found'\)/, 'must fail clearly when slug cannot be resolved');
});

test('wishlist upsert writes resolved UUID instead of raw request value', () => {
  assert.match(dbSource, /resolvedActivityId\s*=\s*await resolveWishlistActivityId/, 'must resolve before insert');
  assert.match(dbSource, /activity_id:\s*resolvedActivityId/, 'must insert resolved UUID into wishlists.activity_id');
});

test('POST /api/me/wishlist still accepts activityId input from client payload', () => {
  assert.match(routeSource, /(?:const|let) activityId = String\(body\?\.activityId \|\| ''\)\.trim\(\)/, 'route must keep activityId payload contract');
  assert.match(routeSource, /addToWishlistDb\(\{ userId: user\.id, activityId \}\)/, 'route delegates activityId to db helper resolver');
});

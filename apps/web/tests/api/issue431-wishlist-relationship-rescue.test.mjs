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
import { listWishlistDb, __setSupabaseClientForTest } from '../../src/lib/db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbSrc = readFileSync(resolve(__dirname, '../../src/lib/db-wishlist.mjs'), 'utf8'); // #1613 strangler 後實作所在

test('listWishlistDb does not use relationship embed query shape', () => {
  assert.doesNotMatch(
    dbSrc,
    /from\('wishlists'\)[\s\S]{0,500}activities\(id,\s*title,\s*slug,\s*price_twd,\s*cover_image_url\)/,
    'listWishlistDb must not select embedded activities(...) from wishlists query'
  );
});

test('listWishlistDb resolves activity details via explicit activities queries', () => {
  assert.match(
    dbSrc,
    /from\('activities'\)[\s\S]{0,300}select\('id,\s*title,\s*slug,\s*price_twd,\s*cover_image_url,\s*region,\s*region_slug'\)[\s\S]{0,250}\.in\('id',\s*activityIds\)/,
    'listWishlistDb must query activities by id explicitly（含 region/region_slug 供 canonical 連結）'
  );
  assert.match(
    dbSrc,
    /from\('activities'\)[\s\S]{0,300}select\('id,\s*title,\s*slug,\s*price_twd,\s*cover_image_url,\s*region,\s*region_slug'\)[\s\S]{0,250}\.in\('slug',\s*activitySlugs\)/,
    'listWishlistDb must query activities by slug explicitly for drifted text activity_id rows（含 region/region_slug）'
  );
});

test('listWishlistDb activities query is RLS-safe: uses service-role client (bypasses RLS)', () => {
  assert.match(
    dbSrc,
    /from '\.\/supabase-env\.mjs'/,
    'wishlist 需經 supabase-env 的 service-role client（RLS bypass；#1616 後 key 走 config getter）'
  );
  const listWishlistSection = dbSrc.slice(dbSrc.indexOf('export async function listWishlistDb'));
  assert.doesNotMatch(
    listWishlistSection,
    /\.eq\('status',\s*'published'\)/,
    'listWishlistDb activities query must not add a manual status filter — service-role key handles this via RLS bypass'
  );
});

test('listWishlistDb handles mixed UUID and slug drift without invalid uuid error', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  const calls = [];
  const fakeSupabase = {
    from(table) {
      if (table === 'wishlists') {
        return {
          select() { return this; },
          eq() { return this; },
          order() {
            return Promise.resolve({
              data: [
                { id: 'w1', activity_id: '550e8400-e29b-41d4-a716-446655440000', added_at: '2026-01-01T00:00:00.000Z' },
                { id: 'w2', activity_id: 'kaohsiung-chaishan-cave-experience', added_at: '2026-01-02T00:00:00.000Z' },
              ],
              error: null,
            });
          },
        };
      }

      if (table === 'activities') {
        return {
          select() {
            return {
              in(column, values) {
                calls.push({ column, values: [...values] });
                if (column === 'id') {
                  return Promise.resolve({
                    data: [{ id: '550e8400-e29b-41d4-a716-446655440000', title: 'UUID Activity', slug: 'uuid-activity', price_twd: 1000, cover_image_url: null }],
                    error: null,
                  });
                }
                if (column === 'slug') {
                  return Promise.resolve({
                    data: [{ id: 'a-slug-row', title: 'Slug Activity', slug: 'kaohsiung-chaishan-cave-experience', price_twd: 2000, cover_image_url: null }],
                    error: null,
                  });
                }
                throw new Error(`unexpected column: ${column}`);
              },
            };
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
  };

  __setSupabaseClientForTest(fakeSupabase);
  try {
    const rows = await listWishlistDb({ userId: 'user-1' });
    assert.equal(rows.length, 2);
    const titleByActivityId = new Map(rows.map((r) => [r.activityId, r.title]));
    assert.equal(titleByActivityId.get('kaohsiung-chaishan-cave-experience'), 'Slug Activity');
    assert.equal(titleByActivityId.get('550e8400-e29b-41d4-a716-446655440000'), 'UUID Activity');
    assert.deepEqual(calls, [
      { column: 'id', values: ['550e8400-e29b-41d4-a716-446655440000'] },
      { column: 'slug', values: ['kaohsiung-chaishan-cave-experience'] },
    ]);
  } finally {
    __setSupabaseClientForTest(null);
    if (oldUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

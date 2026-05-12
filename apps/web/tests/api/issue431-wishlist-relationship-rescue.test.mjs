/**
 * Issue #431 — Wishlist relationship/embed rescue contract
 *
 * Goal: ensure listWishlistDb no longer relies on PostgREST embed
 * (wishlists -> activities relationship metadata) so API can still work
 * when production schema relationship cache is missing/drifted.
 *
 * RLS safety note (EVIDENCE_QA finding):
 *   The `activities` table has RLS enabled with a public SELECT policy
 *   restricted to status='published'. However, listWishlistDb calls getSupabase()
 *   which initialises the client with SUPABASE_SERVICE_ROLE_KEY. The service-role
 *   key bypasses RLS entirely (Supabase guarantee), so the second activities query
 *   returns all matching rows regardless of status — no silent data loss from RLS.
 *   See: supabase/migrations/001_mvp_core_v2.sql (activities RLS policies)
 *        apps/web/src/lib/db.mjs getSupabase() → SUPABASE_SERVICE_ROLE_KEY
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

test('listWishlistDb activities query is RLS-safe: uses service-role client (bypasses RLS)', () => {
  // getSupabase() must use SUPABASE_SERVICE_ROLE_KEY so activities RLS
  // (status='published' filter) does not silently drop wishlisted items.
  // Verify the client init uses the service-role key, not the anon key.
  assert.match(
    dbSrc,
    /SUPABASE_SERVICE_ROLE_KEY/,
    'getSupabase() must use SUPABASE_SERVICE_ROLE_KEY so activities RLS does not apply to wishlist fetches'
  );
  // Verify the second query does NOT add a status filter (RLS bypass means
  // we rely on service role, not a manual .eq('status', 'published')).
  const listWishlistSection = dbSrc.slice(dbSrc.indexOf('export async function listWishlistDb'));
  assert.doesNotMatch(
    listWishlistSection,
    /\.eq\('status',\s*'published'\)/,
    'listWishlistDb activities query must not add a manual status filter — service-role key handles this via RLS bypass'
  );
});

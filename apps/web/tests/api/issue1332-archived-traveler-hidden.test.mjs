/**
 * GH-1332 — archived activities must be invisible on every traveler-facing
 * surface.
 *
 * Production smoke (#1317 / PR #1331, deployment c80f6079) disproved #1286
 * acceptance #1: an activity with status='archived' was still fully served by
 * GET /api/activities/{slug} (200 + full body, status field exposed) and the
 * activity page rendered normally. Listing was safe (listPublishedActivitiesDb
 * filters status='published'); the leak is the detail gateway
 * `getActivityBySlugDb`, which queries `.eq('slug', slug).single()` with NO
 * status gate. All three callers are traveler-facing public surfaces
 * (api detail route, [region]/[slug] page, [region] back-compat page), so the
 * gateway is the right choke point.
 *
 * Fix shape: a post-fetch guard `if (act.status === 'archived') return null`
 * placed after the primary+retry queries. Chosen over `.neq('status',
 * 'archived')` inside the query because `.single()` + `.neq` surfaces a
 * PGRST116 no-row error and relies on the subtle error-path classification
 * below it; the guard is one obvious choke point covering both queries.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const DB_PATH = path.join(WEB_ROOT, 'src/lib/db.mjs');

function makeActivityRow(status) {
  return {
    id: 'act-1332',
    slug: 'archived-fixture-1332',
    title: '封存測試行程',
    tagline: null,
    short_description: 'desc',
    description: 'long desc',
    region: 'taipei',
    region_slug: 'taipei',
    category: 'culture',
    price_twd: 1000,
    duration_minutes: 60,
    min_participants: 1,
    max_participants: 8,
    meeting_point: null,
    meeting_point_map_url: null,
    cover_image_url: null,
    image_urls: [],
    inclusions: [],
    exclusions: [],
    notices: [],
    refund_rules: [],
    refund_policy_type: null,
    safety_notice: null,
    faq: [],
    good_for: [],
    not_good_for: [],
    plans: null,
    status,
    published_at: null,
    itinerary: [],
    social_proof_quotes: [],
    rating_avg: null,
    review_count: 0,
    guide_id: null,
    guide_slug: null,
  };
}

/**
 * Minimal supabase mock supporting the chains getActivityBySlugDb uses:
 *   .from('activities').select(...).eq('slug', x).single()           — detail
 *   .from(...).select(...).eq(...)...  awaited as a thenable          — follow-ups
 * Any non-activities table resolves to empty data so the post-guard code
 * (guide/plans/reviews follow-up queries) never explodes.
 */
function createSupabaseMock(activityRow) {
  function builder(table) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () =>
        Promise.resolve({ data: null, error: null }),
      single: () =>
        table === 'activities'
          ? Promise.resolve(
              activityRow
                ? { data: { ...activityRow }, error: null }
                : { data: null, error: { code: 'PGRST116', message: 'no rows' } },
            )
          : Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } }),
      then: (resolve, reject) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    return chain;
  }
  return { from: (table) => builder(table) };
}

async function importDb() {
  // cache-bust so env set in this test is observed by hasSupabaseEnv()
  return import(`${pathToFileURL(DB_PATH).href}?t=${Date.now()}`);
}

test('GH-1332 RED→GREEN: getActivityBySlugDb returns null for status=archived', async () => {
  process.env.SUPABASE_URL = 'https://test-1332.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-1332';
  const db = await importDb();
  try {
    db.__setSupabaseClientForTest(createSupabaseMock(makeActivityRow('archived')));
    const out = await db.getActivityBySlugDb('archived-fixture-1332');
    assert.equal(
      out,
      null,
      'archived activity must be invisible through the traveler detail gateway',
    );
  } finally {
    db.__setSupabaseClientForTest(null);
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test('GH-1332 sanity: published activity still resolves through the same path', async () => {
  process.env.SUPABASE_URL = 'https://test-1332.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-1332';
  const db = await importDb();
  try {
    db.__setSupabaseClientForTest(createSupabaseMock(makeActivityRow('published')));
    const out = await db.getActivityBySlugDb('archived-fixture-1332');
    assert.ok(out, 'published activity must still resolve');
    assert.equal(out.status, 'published');
    assert.equal(out.title, '封存測試行程');
  } finally {
    db.__setSupabaseClientForTest(null);
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test('GH-1332 source-contract: detail gateway carries the archived guard', () => {
  const src = readFileSync(DB_PATH, 'utf8');
  assert.match(
    src,
    /act[\s\S]{0,80}status[\s\S]{0,40}===\s*['"]archived['"]/,
    'getActivityBySlugDb must short-circuit archived rows to null (GH-1332 guard)',
  );
});

test('GH-1332 source-contract: listing keeps its published-only filter (regression anchor)', () => {
  const src = readFileSync(DB_PATH, 'utf8');
  assert.match(
    src,
    /\.eq\(\s*['"]status['"]\s*,\s*['"]published['"]\s*\)/,
    "listPublishedActivitiesDb must keep .eq('status', 'published') — the listing half of the traveler-visibility contract",
  );
});

import { ok, fail } from '../../../src/lib/api';
import { listPublishedActivitiesDb } from '../../../src/lib/db.mjs';

function makeRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export async function GET(request: Request) {
  const requestId = makeRequestId();
  const startedAt = Date.now();
  const url = new URL(request.url);
  const region = url.searchParams.get('region') || '';
  const category = url.searchParams.get('category') || '';
  const q = url.searchParams.get('q') || '';

  try {
    const data = await listPublishedActivitiesDb({ region, category, q });
    const res = Response.json(ok(data));
    res.headers.set('x-request-id', requestId);
    // Issue #1249 — public, published activity list is the same for every
    // anonymous visitor. Let Vercel's edge cache absorb the load instead of
    // round-tripping Supabase every render. 60s fresh + 5min stale-while-
    // revalidate keeps the listing fast (P95 < 50ms cache hit) while still
    // refreshing when admins publish new activities. CDN cache, not browser,
    // so authenticated travelers still get their own wishlist hydration.
    res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const elapsedMs = Date.now() - startedAt;
    console.error('[api/activities] failed', {
      requestId,
      elapsedMs,
      region,
      category,
      q,
      error: message,
    });

    const res = Response.json(
      fail('SERVER_ERROR', `activities_fetch_failed (requestId=${requestId})`),
      { status: 500 }
    );
    res.headers.set('x-request-id', requestId);
    return res;
  }
}

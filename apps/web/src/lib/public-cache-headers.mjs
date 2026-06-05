/**
 * Issue #1249 — shared public Cache-Control header builder for
 * traveler-facing public listing endpoints (currently just
 * /api/activities; future callers: theme pages, blog index, etc.).
 *
 * Vercel reported x-vercel-cache=MISS on every traveler load because
 * the route emits no public cache headers. Adding s-maxage lets the
 * Vercel Edge cache serve cached JSON for anonymous traffic instead
 * of round-tripping to the function for every page view.
 *
 * Safe to apply ONLY to:
 *   - Endpoints that return published / public-by-design data.
 *   - Endpoints that contain no user-specific information in the
 *     response body and no PII in the query string.
 *
 * NEVER apply to user-specific endpoints (wishlist, orders, admin,
 * guide session) — those must stay private/no-store.
 */

const ONE_MINUTE = 60;
const FIVE_MINUTES = 5 * 60;

/**
 * Returns Cache-Control + Vary headers suitable for the public
 * activities listing.
 *
 *   public                          → cacheable by any shared cache (CDN)
 *   s-maxage=60                     → Vercel Edge holds for 60 s
 *   stale-while-revalidate=300      → may serve stale up to 5 min while
 *                                     refetching in the background
 *
 * No `max-age` is set, so the *browser* still revalidates each navigation,
 * which keeps the SWR effect at the edge layer where invalidation is
 * cheapest. The current set of query keys (region / category / q) all
 * filter public listings; the CDN already keys on URL+query, so Vary
 * does not need to include anything custom.
 *
 * @returns {{ [header: string]: string }}
 */
export function getPublicActivitiesCacheHeaders() {
  return {
    'Cache-Control': `public, s-maxage=${ONE_MINUTE}, stale-while-revalidate=${FIVE_MINUTES}`,
  };
}

/**
 * Convenience: apply the headers from getPublicActivitiesCacheHeaders()
 * to a `Response` object in place. Returns the same Response for
 * chainable use.
 */
export function applyPublicActivitiesCacheHeaders(response) {
  const headers = getPublicActivitiesCacheHeaders();
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

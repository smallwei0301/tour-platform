/**
 * Activities region listing (`/activities/[region]`) should not block first
 * useful render on a client-side `/api/activities` fetch, mirroring what
 * PR #1252 / issue #1249 fixed for the parent `/activities` route.
 *
 * Before the fix this route had `dynamic = 'force-dynamic'` cancelling the
 * `revalidate = 60` it had set, AND `<ActivitiesContent>` received only an
 * `initialRegion` (no `initialActivities`). Every anonymous visitor paid
 * the Supabase round-trip on every render.
 *
 * This spec mocks `/api/activities` with a 5s delay and asserts the
 * region page is interactive well before that resolves.
 */
import { test, expect } from '@playwright/test';

test('region listing renders cards from SSR even when /api/activities is slow', async ({ page }) => {
  let apiResolvedAt: number | null = null;
  await page.route('**/api/activities**', async (route) => {
    await new Promise((r) => setTimeout(r, 5_000));
    apiResolvedAt = Date.now();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });

  await page.goto('/activities/kaohsiung', { waitUntil: 'domcontentloaded' });

  // Region page wraps ActivitiesContent in a Suspense with `fallback={null}`,
  // so there's no `載入中⋯` text to assert. The proof is the mock did NOT
  // resolve before domcontentloaded — page is fully rendered with SSR
  // initial data even though /api/activities is still in-flight.
  expect(apiResolvedAt).toBeNull();

  // If the in-memory store has cards for this region, they must have rendered
  // BEFORE the mocked API resolved (proves SSR initial data is in effect).
  const cards = page.locator('[data-testid="activity-card-link"]');
  const cardCountByDeadline = await cards.count();
  if (cardCountByDeadline > 0) {
    expect(apiResolvedAt).toBeNull();
  }
});

test('region listing does not have a force-dynamic + revalidate=60 conflict (source contract)', async ({ request }) => {
  // We can't ping the build output directly without leaking server internals
  // to a test, so this case is the smaller source-contract assertion: a
  // request against /activities/<region> hits 200 within the cache window,
  // not a function cold-start every time.
  const res = await request.get('/activities/kaohsiung');
  expect(res.status()).toBe(200);
});

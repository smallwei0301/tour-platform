import { test, expect } from '@playwright/test';

type RouteCase = {
  name: string;
  path: string;
};

const ROUTE_MATRIX: RouteCase[] = [
  { name: 'activity-detail-kaohsiung', path: '/activities/kaohsiung/kaohsiung-chaishan-cave-experience' },
  { name: 'activity-detail-taipei', path: '/activities/taipei/dadadaocheng-walk' },
  { name: 'activity-detail-hualien', path: '/activities/hualien/hualien-river-trekking' },
  { name: 'booking-slug', path: '/booking/kaohsiung-chaishan-cave-experience?plan=half-day' },
  { name: 'blog-detail', path: '/blog/why-private-guide' },
  { name: 'experiences-detail', path: '/experiences/kaohsiung-chaishan-cave-experience' },
];

test.describe('Deep-link smoke matrix', () => {
  for (const routeCase of ROUTE_MATRIX) {
    test(`${routeCase.name} should not be force-rewritten by middleware`, async ({ page, baseURL }) => {
      const target = `${baseURL}${routeCase.path}`;
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' });

      // Route can be 200/404 depending on data seed, but should not be redirected away.
      const status = response?.status() ?? 0;
      expect([200, 404]).toContain(status);

      const finalPath = new URL(page.url()).pathname;
      const expectedPath = new URL(target).pathname;
      expect(finalPath).toBe(expectedPath);

      // Guardrail: ensure not rewritten to checkout by middleware.
      expect(finalPath.startsWith('/checkout')).toBeFalsy();
    });
  }
});

import { test, expect } from '@playwright/test';

const ACTIVITY_DETAIL = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';
const BOOKING_PAGE = '/booking/kaohsiung-chaishan-cave-experience';
const BLOG_DETAIL = '/blog/smoke-route-consistency-check';
const EXPERIENCE_DETAIL = '/experiences/kaohsiung-chaishan-cave-experience';

test.describe('Route consistency (no middleware forced redirect)', () => {
  test('activity detail deep-link should stay on /activities/[region]/[slug]', async ({ page }) => {
    await page.goto(ACTIVITY_DETAIL, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`${ACTIVITY_DETAIL}(\\?|$)`));
  });

  test('booking/blog/experiences deep-links should not be force-rewritten', async ({ page }) => {
    await page.goto(BOOKING_PAGE, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`${BOOKING_PAGE}(\\?|$)`));

    await page.goto(BLOG_DETAIL, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`${BLOG_DETAIL}(\\?|$)`));

    await page.goto(EXPERIENCE_DETAIL, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`${EXPERIENCE_DETAIL}(\\?|$)`));
  });
});

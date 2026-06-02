import { test, expect } from '@playwright/test';

const ACTIVITY_FIXTURE = [
  {
    id: 'fx-1',
    slug: 'kaohsiung-chaishan-cave-experience',
    title: '柴山探洞體驗',
    region: '高雄市',
    regionSlug: 'kaohsiung',
    category: '戶外冒險',
    priceTwd: 1800,
    status: 'published',
  },
  {
    id: 'fx-2',
    slug: 'taipei-night-market-tour',
    title: '台北夜市導覽',
    region: '台北市',
    regionSlug: 'taipei',
    category: '美食體驗',
    priceTwd: 1200,
    status: 'published',
  },
  {
    id: 'fx-3',
    slug: 'kaohsiung-history-walk',
    title: '高雄歷史漫步',
    region: '高雄市',
    regionSlug: 'kaohsiung',
    category: '文化歷史',
    priceTwd: 900,
    status: 'published',
  },
];

test.describe('Issue #1073 — /activities/[region] renders region listing, not 404', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/activities**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: ACTIVITY_FIXTURE }),
      });
    });
    await page.route('**/api/me/wishlist/ids', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [] }),
      });
    });
  });

  test('T1073.1 — /activities/kaohsiung returns 200 and does NOT render not-found UI', async ({ page }) => {
    const response = await page.goto('/activities/kaohsiung');
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1', { hasText: '找不到這個頁面' })).toHaveCount(0);
  });

  test('T1073.2 — /activities/kaohsiung pre-applies 高雄市 region filter (kaohsiung activities visible, taipei filtered out)', async ({ page }) => {
    await page.goto('/activities/kaohsiung');
    await expect(page.getByText('柴山探洞體驗')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('高雄歷史漫步')).toBeVisible();
    await expect(page.getByText('台北夜市導覽')).toHaveCount(0);
  });

  test('T1073.3 — /activities/hualien (another known region) also renders listing UI, not not-found', async ({ page }) => {
    const response = await page.goto('/activities/hualien');
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1', { hasText: '找不到這個頁面' })).toHaveCount(0);
  });

  test('T1073.4 — region listing page emits Twitter card metadata (SEO regression guard)', async ({ page }) => {
    await page.goto('/activities/kaohsiung');
    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    const twitterTitle = await page.locator('meta[name="twitter:title"]').getAttribute('content');
    expect(twitterCard).toBe('summary_large_image');
    expect(twitterTitle).toContain('高雄');
  });
});

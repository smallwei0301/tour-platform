import { test, expect } from '@playwright/test';

/**
 * 附加地區顯示到前台 + 跨地區搜尋（使用者需求）。
 *
 * 測試環境無 Supabase，詳情頁／地區頁走 fixtures（src/fixtures/data.ts）。
 * fixture「kaohsiung-chaishan-cave-experience」主要地區=高雄市，附加地區=['花蓮縣']。
 *
 * AC1：詳情頁顯示附加地區（高雄市行程上看得到「花蓮縣」）。
 * AC2：旅客用附加地區（花蓮）搜尋／瀏覽時，該高雄行程也一併出現。
 */

const CHAISHAN_SLUG = 'kaohsiung-chaishan-cave-experience';

test('AC1 - 詳情頁顯示附加地區', async ({ page }) => {
  await page.goto(`/activities/kaohsiung/${CHAISHAN_SLUG}`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('activity-detail-title')).toBeVisible({ timeout: 10_000 });

  const extra = page.getByTestId('activity-additional-regions');
  await expect(extra).toBeVisible();
  await expect(extra).toContainText('花蓮縣');
  // 附加地區可點擊連到該地區頁
  await expect(extra.getByRole('link', { name: '花蓮縣' })).toHaveAttribute('href', '/activities/hualien');
});

test('AC2 - 用附加地區（花蓮）瀏覽時，高雄的附加地區行程也出現', async ({ page }) => {
  // 只擋 wishlist（避免未登入雜訊）；/api/activities 走真實 fixtures 流程不擋。
  await page.route('**/api/me/wishlist/ids', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });

  const response = await page.goto('/activities/hualien', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);

  // 柴山行程（主要地區高雄市、附加地區花蓮縣）應在花蓮地區頁出現
  await expect(page.getByText('柴山探洞體驗')).toBeVisible({ timeout: 10_000 });
});

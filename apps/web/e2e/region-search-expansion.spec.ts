import { test, expect } from '@playwright/test';

/**
 * 前台搜尋短名展開（使用者需求）：短名只用於分類/搜尋，且只用現行縣市名稱。
 * 「嘉義」要同時搜到嘉義市＋嘉義縣、「新竹」搜新竹市＋新竹縣（兩者今日並存）；
 * 其餘短名對應單一現行縣市（高雄→高雄市，無舊高雄縣）。
 *
 * 作法：帶 date 參數強制 client 重抓 /api/activities（此處 mock 回受控清單），
 * ActivitiesContent 以 activityMatchesRegion→expandRegionToDbValues 做 client 篩選。
 */

const MOCK_ACTIVITIES = [
  { id: 'a1', slug: 'chiayi-city-tour', title: '嘉義市小旅行', region: '嘉義市', regionSlug: 'chiayi-city', regions: [], category: '文化歷史', priceTwd: 1000, status: 'published' },
  { id: 'a2', slug: 'chiayi-county-tour', title: '阿里山雲海健行', region: '嘉義縣', regionSlug: 'chiayi', regions: [], category: '戶外冒險', priceTwd: 1500, status: 'published' },
  { id: 'a3', slug: 'hsinchu-city-tour', title: '新竹市城隍廟導覽', region: '新竹市', regionSlug: 'hsinchu', regions: [], category: '美食體驗', priceTwd: 800, status: 'published' },
  { id: 'a4', slug: 'hsinchu-county-tour', title: '內灣old街散策', region: '新竹縣', regionSlug: 'hsinchu-county', regions: [], category: '文化歷史', priceTwd: 900, status: 'published' },
  { id: 'a5', slug: 'taipei-tour', title: '台北大稻埕漫步', region: '台北市', regionSlug: 'taipei', regions: [], category: '文化歷史', priceTwd: 1100, status: 'published' },
];

async function mock(page: import('@playwright/test').Page) {
  await page.route('**/api/activities**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: MOCK_ACTIVITIES }) });
  });
  await page.route('**/api/me/wishlist/ids', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });
}

test('短名「嘉義」→ 同時出現嘉義市＋嘉義縣（不含新竹/台北）', async ({ page }) => {
  await mock(page);
  await page.goto('/activities?region=嘉義&date=2026-12-31', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('嘉義市小旅行')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('阿里山雲海健行')).toBeVisible();
  await expect(page.getByText('新竹市城隍廟導覽')).toHaveCount(0);
  await expect(page.getByText('台北大稻埕漫步')).toHaveCount(0);
});

test('短名「新竹」→ 同時出現新竹市＋新竹縣（不含嘉義/台北）', async ({ page }) => {
  await mock(page);
  await page.goto('/activities?region=新竹&date=2026-12-31', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('新竹市城隍廟導覽')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('內灣old街散策')).toBeVisible();
  await expect(page.getByText('嘉義市小旅行')).toHaveCount(0);
  await expect(page.getByText('台北大稻埕漫步')).toHaveCount(0);
});

test('全名「嘉義市」→ specific，只出現嘉義市（不含嘉義縣）', async ({ page }) => {
  await mock(page);
  await page.goto('/activities?region=嘉義市&date=2026-12-31', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('嘉義市小旅行')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('阿里山雲海健行')).toHaveCount(0);
});

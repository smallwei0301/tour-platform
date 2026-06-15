import { test, expect } from '@playwright/test';

// #mobile-categories — 主題探索分類調整、五大行程主題統一、各主題介紹頁。

const ACTIVITY_FIXTURE = [
  {
    id: 'fx-cave',
    slug: 'kaohsiung-chaishan-cave-experience',
    title: '高雄柴山探洞體驗',
    region: '高雄市',
    regionSlug: 'kaohsiung',
    category: 'outdoor',
    tagline: '由熟悉地形的人帶你走進柴山探洞路線。',
    priceTwd: 2000,
    status: 'published',
  },
  {
    id: 'fx-food',
    slug: 'taipei-night-market-food-tour',
    title: '台北夜市美食文化探索',
    region: '台北市',
    regionSlug: 'taipei',
    category: 'food',
    tagline: '不只吃，還要懂為什麼好吃。',
    priceTwd: 1800,
    status: 'published',
  },
  {
    id: 'fx-culture',
    slug: 'dadadaocheng-walk',
    title: '大稻埕百年老街深度漫步',
    region: '台北市',
    regionSlug: 'taipei',
    category: 'culture',
    tagline: '真正認識一個活了百年的街區。',
    priceTwd: 1500,
    status: 'published',
  },
];

test.describe('行程主題篩選統一為五大主題', () => {
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

  test('「行程主題」呈現五大主題選項', async ({ page }) => {
    await page.goto('/activities');
    const themeFilter = page.locator('details', { hasText: '行程主題' });
    await themeFilter.locator('summary').click();
    for (const label of ['柴山探洞', '野外溪流', '文化歷史', '美食導覽', '山野秘境']) {
      await expect(themeFilter.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('勾選「美食導覽」只顯示美食行程', async ({ page }) => {
    await page.goto('/activities');
    await expect(page.getByText('高雄柴山探洞體驗')).toBeVisible({ timeout: 10_000 });
    const themeFilter = page.locator('details', { hasText: '行程主題' });
    await themeFilter.locator('summary').click();
    await themeFilter.getByText('美食導覽', { exact: true }).click();
    await expect(page.getByText('台北夜市美食文化探索')).toBeVisible();
    await expect(page.getByText('高雄柴山探洞體驗')).toHaveCount(0);
    await expect(page.getByText('大稻埕百年老街深度漫步')).toHaveCount(0);
  });

  test('主題介紹頁 deeplink 預先套用對應主題篩選', async ({ page }) => {
    await page.goto(`/activities?type=${encodeURIComponent('文化歷史')}`);
    await expect(page.getByText('大稻埕百年老街深度漫步')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('高雄柴山探洞體驗')).toHaveCount(0);
  });
});

test.describe('五大主題介紹頁', () => {
  const PAGES = [
    { path: '/theme/cave-exploration', heading: '鑽進高雄的秘密地下世界', crumb: '柴山探洞' },
    { path: '/theme/river-trekking', heading: '走進台灣最純淨的野溪', crumb: '野外溪流' },
    { path: '/theme/culture-history', heading: '走進活了百年的街區與部落', crumb: '文化歷史' },
    { path: '/theme/food-tour', heading: '跟著在地人，吃懂一座城市', crumb: '美食導覽' },
    { path: '/theme/mountain-wilderness', heading: '走進台灣的山林深處', crumb: '山野秘境' },
  ];

  for (const { path, heading, crumb } of PAGES) {
    test(`${path} 正常渲染主視覺與麵包屑`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1', { hasText: heading })).toBeVisible();
      await expect(page.locator('.tp-breadcrumb', { hasText: crumb })).toBeVisible();
    });
  }
});

test.describe('首頁主題探索分類', () => {
  test('呈現 山徑／野溪／文化／美食 並連到主題頁', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
    });
    await page.goto('/');
    const themes = page.locator('.lp-themes');
    await expect(themes.getByText('山徑', { exact: true })).toBeVisible();
    await expect(themes.getByText('野溪', { exact: true })).toBeVisible();
    await expect(themes.getByText('文化', { exact: true })).toBeVisible();
    await expect(themes.getByText('美食', { exact: true })).toBeVisible();
    await expect(themes.locator('a[href="/theme/river-trekking"]')).toHaveCount(1);
    await expect(themes.locator('a[href="/theme/culture-history"]')).toHaveCount(1);
  });
});

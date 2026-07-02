import { test, expect } from '@playwright/test';

// Issue #1557（健檢 v2 P1-6）— 活動列表「評價最高」排序＋無限捲動。
// backend-mocked（page.route）：不依賴 Supabase seed。

// 20 筆 fixture：評分／價格皆有區別，方便驗證排序與分頁。
const ACTIVITY_FIXTURE = Array.from({ length: 20 }, (_, i) => ({
  id: `fx-${i + 1}`,
  slug: `activity-${String(i + 1).padStart(2, '0')}`,
  title: `行程 ${i + 1}`,
  region: '高雄市',
  regionSlug: 'kaohsiung',
  category: '戶外冒險',
  priceTwd: 1000 + i * 100,
  status: 'published',
  // 讓 fx-3 評分最高(5.0)、fx-1 次之(4.8)、其餘遞減，方便斷言排序
  ratingAvg: i === 2 ? 5.0 : i === 0 ? 4.8 : Math.max(3.0, 4.5 - i * 0.05),
  reviews: [{ rating: 5 }],
}));

const PAGE_SIZE = 12;

test.describe('Issue #1557 — 活動列表評價排序＋無限捲動', () => {
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

  test('T1557.1 — 初始只渲染前一頁（12 筆），不是全部 20 筆', async ({ page }) => {
    // 帶 date 參數 → 關閉 SSR-hydration 的 skipInitialFetch，強制 client 重抓，
    // 讓 page.route 的 mock fixture 實際驅動資料（否則首屏是 in-memory store fixtures）。
    await page.goto('/activities?date=2026-12-01');
    const cards = page.locator('[data-testid="activity-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    await expect(cards).toHaveCount(PAGE_SIZE);
  });

  test('T1557.2 — 捲動觸底後追加下一批，最終渲染全部 20 筆', async ({ page }) => {
    // 帶 date 參數 → 關閉 SSR-hydration 的 skipInitialFetch，強制 client 重抓，
    // 讓 page.route 的 mock fixture 實際驅動資料（否則首屏是 in-memory store fixtures）。
    await page.goto('/activities?date=2026-12-01');
    const cards = page.locator('[data-testid="activity-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    await expect(cards).toHaveCount(PAGE_SIZE);

    // 觸底載入更多，直到全部出現
    await expect(async () => {
      await page.mouse.wheel(0, 4000);
      await expect(cards).toHaveCount(ACTIVITY_FIXTURE.length);
    }).toPass({ timeout: 10_000 });
  });

  test('T1557.3 — 「評價最高」排序把最高分行程排到最前', async ({ page }) => {
    // 帶 date 參數 → 關閉 SSR-hydration 的 skipInitialFetch，強制 client 重抓，
    // 讓 page.route 的 mock fixture 實際驅動資料（否則首屏是 in-memory store fixtures）。
    await page.goto('/activities?date=2026-12-01');
    await expect(page.locator('[data-testid="activity-card"]').first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('combobox', { name: '排序' }).selectOption('rating');

    const firstSlug = await page
      .locator('[data-testid="activity-card"]')
      .first()
      .getAttribute('data-activity-slug');
    // fx-3（ratingAvg 5.0）為最高分 → activity-03
    expect(firstSlug).toBe('activity-03');
  });

  test('T1557.4 — 排序下拉含「評價最高」選項', async ({ page }) => {
    // 帶 date 參數 → 關閉 SSR-hydration 的 skipInitialFetch，強制 client 重抓，
    // 讓 page.route 的 mock fixture 實際驅動資料（否則首屏是 in-memory store fixtures）。
    await page.goto('/activities?date=2026-12-01');
    const select = page.getByRole('combobox', { name: '排序' });
    await expect(select.locator('option', { hasText: '評價最高' })).toHaveCount(1);
  });
});

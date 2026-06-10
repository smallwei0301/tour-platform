import { test, expect } from './helpers';

/**
 * Admin dashboard 趨勢圖必須跟隨時間範圍切換。
 *
 * Bug：後端 trend builder 寫死近 7 日，切「近 30 日」時 KPI 卡片換了
 * 範圍、趨勢圖仍是 7 桶。本 spec 不 mock API — 直接打 dev server 的
 * summary route（in-memory fallback），端到端驗證桶數跟著 preset 變。
 */

test.describe.configure({ timeout: 90_000 });

// 趨勢圖每個日桶有 title="YYYY-MM-DD = N"
const BUCKETS = '[data-guide="trend-chart"] [title*=" = "]';

test('趨勢圖桶數跟隨時間範圍：近 7 日 → 7 桶、近 30 日 → 30 桶、今天 → 1 桶', async ({ authedPage: page }) => {
  await page.goto('/admin');

  // 預設近 7 日
  await expect(page.getByText('總訂單')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(BUCKETS)).toHaveCount(7, { timeout: 15_000 });

  // 近 30 日 → 30 桶
  await page.getByRole('button', { name: '近 30 日' }).click();
  await expect(page.locator(BUCKETS)).toHaveCount(30, { timeout: 15_000 });

  // 今天 → 1 桶
  await page.getByRole('button', { name: '今天' }).click();
  await expect(page.locator(BUCKETS)).toHaveCount(1, { timeout: 15_000 });
});

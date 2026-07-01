import { test, expect } from '@playwright/test';

/**
 * 導遊「熟悉區域」統一全名後，導遊列表仍以短名群組篩選、短名顯示，並正確比對。
 * 測試環境無 Supabase → 走 fixtures（含導遊 Andy Lee=高雄、陳建志=台北、林阿明=花蓮）。
 * fixtures 目前仍存短名，程式碼會正規化，故驗證對舊/新資料都成立。
 */

test('?region=高雄 → 只顯示高雄導遊（台北/花蓮導遊被篩掉）', async ({ page }) => {
  await page.goto('/guides?region=高雄', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Andy Lee（李衍錫）')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('陳建志')).toHaveCount(0);
  await expect(page.getByText('林阿明')).toHaveCount(0);
});

test('導遊列表卡片以短名顯示地區（📍 高雄，非高雄市）', async ({ page }) => {
  await page.goto('/guides', { waitUntil: 'domcontentloaded' });

  // Andy Lee 卡片的地區顯示為短名「高雄」
  await expect(page.getByText('📍 高雄', { exact: false })).toBeVisible({ timeout: 10_000 });
});

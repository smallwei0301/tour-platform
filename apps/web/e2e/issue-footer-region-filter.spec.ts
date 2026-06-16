import { test, expect } from '@playwright/test';

// 根因回歸（footer 依地區選高雄 0 筆）：footer／熱門目的地用「短名」連結
// （/activities?region=高雄），但行程資料以「全名」高雄市儲存。修復前用字串
// 精確比對 → '高雄' !== '高雄市' → 列表 0 筆。本 spec 用真實瀏覽器走訪該連結，
// 驗證短名 query 也能正確篩出高雄行程、排除非高雄行程。
//
// 說明：/activities 由 server 端 listPublishedActivitiesDb 帶 initialActivities
// SSR，且未帶 date/price 時 client 端會 skip 初次 fetch（#1345），因此列表內容
// 來自真實 fixtures（dev 無 Supabase → in-memory fallback）。斷言對齊真實
// fixtures 標題（高雄柴山探洞 / 大稻埕 / 台北夜市 / 花蓮秀姑巒溪），與
// e2e/issue1073-activities-region-listing.spec.ts 同一驗證姿態。

test.describe('Footer 依地區（短名）篩選 — 高雄', () => {
  test('footer 短名連結 /activities?region=高雄 篩出高雄行程、排除非高雄', async ({ page }) => {
    await page.goto('/activities?region=高雄');

    // 高雄行程（以全名「高雄市」儲存）必須顯示 —— 修復前這裡會是空清單。
    await expect(page.getByText('高雄柴山探洞體驗', { exact: false })).toBeVisible({ timeout: 10_000 });
    // 不應落入空狀態。
    await expect(page.getByText('找不到符合條件的行程')).toHaveCount(0);
    // 非高雄行程（台北／花蓮）要被濾掉。
    await expect(page.getByText('大稻埕百年老街深度漫步')).toHaveCount(0);
    await expect(page.getByText('台北夜市美食文化探索')).toHaveCount(0);
    await expect(page.getByText('花蓮秀姑巒溪溯溪全日冒險')).toHaveCount(0);
  });

  test('英文 slug 連結 /activities?region=kaohsiung 行為一致', async ({ page }) => {
    await page.goto('/activities?region=kaohsiung');
    await expect(page.getByText('高雄柴山探洞體驗', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('大稻埕百年老街深度漫步')).toHaveCount(0);
  });

  test('全名連結 /activities?region=高雄市 與短名結果一致（冪等）', async ({ page }) => {
    await page.goto('/activities?region=高雄市');
    await expect(page.getByText('高雄柴山探洞體驗', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('大稻埕百年老街深度漫步')).toHaveCount(0);
  });

  test('從首頁 footer 點「高雄」可導到正確篩選結果（真實點擊）', async ({ page }) => {
    await page.goto('/');
    const kaohsiungLink = page
      .locator('a.tp-footer-region-link', { hasText: '高雄' })
      .first();
    await kaohsiungLink.scrollIntoViewIfNeeded();
    await kaohsiungLink.click();
    await expect(page).toHaveURL(/\/activities\?region=/);
    await expect(page.getByText('高雄柴山探洞體驗', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('大稻埕百年老街深度漫步')).toHaveCount(0);
  });
});

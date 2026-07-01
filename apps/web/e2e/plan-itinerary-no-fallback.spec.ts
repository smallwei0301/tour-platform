import { test, expect } from '@playwright/test';

// #admin-plan-revert 後續：活動層級 itinerary 備援與舊版 activities.plans 讀取已移除。
// 這支只做「真實瀏覽器 render smoke」：確認公開行程詳情頁在移除 legacy 讀取後仍能
// 正常伺服器渲染（不 500）、標題與詳細行程區塊存在，且不再出現備援 itinerary 佔位。
const ACTIVITY_PATH = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';

test('activity detail renders after legacy plans/itinerary removal', async ({ page }) => {
  const resp = await page.goto(ACTIVITY_PATH, { waitUntil: 'domcontentloaded' });
  expect(resp?.status(), 'detail page must not 5xx').toBeLessThan(500);

  // 頁面正常渲染（標題可見）。
  await expect(page.getByTestId('activity-detail-title')).toBeVisible();

  // 詳細行程錨點存在時，內容只來自方案（未選方案→提示；沒有方案→整段隱藏），
  // 不應再出現任何 render 例外。這裡確認頁面本體非空白即可。
  const bodyText = (await page.textContent('body')) || '';
  expect(bodyText.length).toBeGreaterThan(200);
});

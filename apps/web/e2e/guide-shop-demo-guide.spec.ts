import { test, expect } from './helpers';

// #1475 商店頁示範嚮導（吳洛晴 / wu-luo-ching）flag-on 真瀏覽器 smoke。
// 此嚮導專供 Guide Shop 展示，book step1 有 3 張短～中標題方案卡，對齊手機 mockup 圖2。
// 資料吃 in-memory fixtures（台東 3 行程各 1 方案），與 andy-lee 等既有嚮導完全隔離、不需 Supabase。
// flag 未開時 /shop 回 404，本 spec 開頭 probe 後自動 skip。

const SLUG = 'wu-luo-ching';

test('商店首頁：示範嚮導 吳洛晴 hero＋引路人卡＋預約三步驟＋CTA', async ({ page }) => {
  const probe = await page.request.get(`/guides/${SLUG}/shop`);
  test.skip(probe.status() === 404, 'NEXT_PUBLIC_GUIDE_SHOP_ENABLED 未開，商店頁 404 — 本 smoke 需 flag-on server');

  await page.goto(`/guides/${SLUG}/shop`);

  await expect(page.getByRole('heading', { level: 1 })).toContainText('線上預約');
  await expect(page.getByTestId('shop-hero')).toBeVisible();
  await expect(page.getByText('祕島引路人').first()).toBeVisible();
  await expect(page.getByText('預約三步驟')).toBeVisible();

  const cta = page.getByRole('link', { name: /替我留一個位置/ });
  await expect(cta).toHaveAttribute('href', new RegExp(`/guides/${SLUG}/shop/book`));
});

test('book 4 步流程：頁1 選行程 → 頁2 選方案（無照片/無人數）→ 頁3 人數+日期', async ({ page }) => {
  const probe = await page.request.get(`/guides/${SLUG}/shop/book`);
  test.skip(probe.status() === 404, 'NEXT_PUBLIC_GUIDE_SHOP_ENABLED 未開，商店頁 404 — 本 smoke 需 flag-on server');

  await page.goto(`/guides/${SLUG}/shop/book`);

  // 頁1：選行程（活動卡）——屏東縣 1 個活動 ＋ 台東縣 1 個活動 ＝ 2 張活動卡
  await expect(page.getByRole('heading', { name: '選一條想走的徑' })).toBeVisible();
  await expect(page.getByText('屏東縣')).toBeVisible();
  await expect(page.getByText('台東縣')).toBeVisible();
  await expect(page.getByTestId('shop-activity-card')).toHaveCount(2);

  // 點台東縣活動 → 頁2 選方案（純文字方案：2 個 plan，無照片、無人數 stepper）
  await page.getByTestId('shop-activity-card').nth(1).click();
  await expect(page.getByRole('heading', { name: '選擇方案' })).toBeVisible();
  await expect(page.getByTestId('shop-plan-card')).toHaveCount(2);
  await expect(page.getByTestId('shop-guests')).toHaveCount(0); // 頁2 不選人數

  // 選方案 → 頁3：人數 stepper + 日期
  await page.getByTestId('shop-plan-card').first().click();
  await expect(page.getByTestId('shop-plan-summary')).toBeVisible();
  await expect(page.getByTestId('shop-guests-step2')).toBeVisible(); // 頁3 才選人數
  await expect(page.getByTestId('shop-change-plan')).toBeVisible();
});

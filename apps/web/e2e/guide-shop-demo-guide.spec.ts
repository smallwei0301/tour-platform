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

test('book step1：示範嚮導 3 張方案卡（對齊 mockup 圖2），可選第 2 張並進 step2', async ({ page }) => {
  const probe = await page.request.get(`/guides/${SLUG}/shop/book`);
  test.skip(probe.status() === 404, 'NEXT_PUBLIC_GUIDE_SHOP_ENABLED 未開，商店頁 404 — 本 smoke 需 flag-on server');

  await page.goto(`/guides/${SLUG}/shop/book`);

  // 台東縣區塊下恰有 3 張方案卡（多方案 → 停在 step1 瀏覽，不自動跳 step2）
  await expect(page.getByText('台東縣')).toBeVisible();
  await expect(page.getByTestId('shop-plan-card')).toHaveCount(3);
  await expect(page.getByText('晨霧稜線健行｜清晨限定的無人山徑')).toBeVisible();
  await expect(page.getByText('祕境海灣浮潛｜退潮才現身的珊瑚礁灣')).toBeVisible();
  await expect(page.getByText('星空草原露營｜無光害草原的過夜體驗')).toBeVisible();

  // 選第 2 張 → 出現同行人數 stepper、底部摘要；按 CTA 進 step2 選日期
  await page.getByTestId('shop-plan-card').nth(1).click();
  await expect(page.getByTestId('shop-guests')).toBeVisible();
  await page.getByRole('button', { name: /選擇日期和時間/ }).click();
  await expect(page.getByTestId('shop-plan-summary')).toBeVisible();
  await expect(page.getByTestId('shop-change-plan')).toBeVisible();
});

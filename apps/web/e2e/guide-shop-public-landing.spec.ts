import { test, expect } from './helpers';

// 商店首頁公開版（flag-on 真瀏覽器 smoke）。
// 商店頁受 NEXT_PUBLIC_GUIDE_SHOP_ENABLED（預設 OFF）閘控：flag 未開時 /shop 回 404，
// 本 spec 開頭 probe 後自動 skip —— 要跑請用：
//   NEXT_PUBLIC_GUIDE_SHOP_ENABLED=1 npm run dev（或 PLAYWRIGHT_NO_WEBSERVER=1 對現成 server）
// 資料吃 in-memory fixtures（andy-lee＋柴山探洞方案），不需 Supabase。

const SLUG = 'andy-lee';

test('商店首頁（Midao mockup 圖3）：hero＋引路人卡＋預約三步驟＋CTA', async ({ page }) => {
  const probe = await page.request.get(`/guides/${SLUG}/shop`);
  test.skip(probe.status() === 404, 'NEXT_PUBLIC_GUIDE_SHOP_ENABLED 未開，商店頁 404 — 本 smoke 需 flag-on server');

  await page.goto(`/guides/${SLUG}/shop`);

  // H1「線上預約」＋ hero ＋ 引路人徽章
  await expect(page.getByRole('heading', { level: 1 })).toContainText('線上預約');
  await expect(page.getByTestId('shop-hero')).toBeVisible();
  await expect(page.getByText('祕島引路人').first()).toBeVisible();

  // 預約三步驟區塊＋三個真實圖示（附件資產）
  await expect(page.getByText('預約三步驟')).toBeVisible();
  await expect(page.locator('.sib-step')).toHaveCount(3);
  await expect(page.locator('.sib-step-ico img').first()).toBeVisible();

  // CTA「替我留一個位置」→ /shop/book
  const cta = page.getByRole('link', { name: /替我留一個位置/ });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', new RegExp(`/guides/${SLUG}/shop/book`));
});

// 像素級比對用的固定 mock 頁（保留字 slug，見 src/fixtures/shop-landing-mock.mjs）：
// 內容／版面永遠固定，不受真實導遊資料影響，供 Playwright 疊圖比對使用。
const MOCK_SLUG = '__mock_landing__';

test('商店首頁 mock 對比頁：固定內容渲染正常（供像素級比對使用）', async ({ page }) => {
  const probe = await page.request.get(`/guides/${MOCK_SLUG}/shop`);
  test.skip(probe.status() === 404, 'NEXT_PUBLIC_GUIDE_SHOP_ENABLED 未開，商店頁 404 — 本 smoke 需 flag-on server');

  await page.goto(`/guides/${MOCK_SLUG}/shop`);

  await expect(page.getByRole('heading', { level: 1 })).toContainText('線上預約');
  await expect(page.getByTestId('shop-hero')).toBeVisible();
  await expect(page.getByText('高雄市', { exact: false })).toBeVisible();
  await expect(page.getByText('Andy Lee')).toBeVisible();
  await expect(page.getByText('祕島引路人')).toBeVisible();
  await expect(page.locator('.sib-step')).toHaveCount(3);
  await expect(page.getByRole('link', { name: /替我留一個位置/ })).toBeVisible();
});

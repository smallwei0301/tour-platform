import { test, expect } from './helpers';

// 商店首頁公開版（flag-on 真瀏覽器 smoke）。
// 商店頁受 NEXT_PUBLIC_GUIDE_SHOP_ENABLED（預設 OFF）閘控：flag 未開時 /shop 回 404，
// 本 spec 開頭 probe 後自動 skip —— 要跑請用：
//   NEXT_PUBLIC_GUIDE_SHOP_ENABLED=1 npm run dev（或 PLAYWRIGHT_NO_WEBSERVER=1 對現成 server）
// 資料吃 in-memory fixtures（andy-lee＋柴山探洞方案），不需 Supabase。

const SLUG = 'andy-lee';

test('商店首頁：方案卡 server-rendered＋信任列＋分享列＋QR', async ({ page }) => {
  const probe = await page.request.get(`/guides/${SLUG}/shop`);
  test.skip(probe.status() === 404, 'NEXT_PUBLIC_GUIDE_SHOP_ENABLED 未開，商店頁 404 — 本 smoke 需 flag-on server');

  await page.goto(`/guides/${SLUG}/shop`);

  // H1「線上預約」＋引路人徽章（Midao mockup 版面）
  await expect(page.getByRole('heading', { level: 1 })).toContainText('線上預約');
  await expect(page.getByText('祕島引路人').first()).toBeVisible();

  // 方案卡由 server 直出（fixtures 有兩個 active 方案），深連結帶預選參數
  const cards = page.getByTestId('shop-landing-plan-card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(1);
  await expect(cards.first()).toHaveAttribute('href', /shop\/book\?activityId=.+&planId=.+/);

  // 政策區塊
  await expect(page.getByTestId('shop-policy')).toContainText('ECPay');

  // 分享列：複製回饋＋QR toggle
  await page.getByTestId('shop-share-copy').click();
  await expect(page.getByTestId('shop-share-copy')).toContainText('已複製');
  await page.getByTestId('shop-share-qr').click();
  await expect(page.getByTestId('shop-share-qr-panel').locator('svg')).toBeVisible();

  // LINE 分享為純連結
  await expect(page.getByTestId('shop-share-line')).toHaveAttribute('href', /line\.me\/R\/msg\/text\//);
});

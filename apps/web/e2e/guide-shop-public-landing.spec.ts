import { test, expect } from './helpers';

// 商店首頁公開版（flag-on 真瀏覽器 smoke）。
// 商店頁受 NEXT_PUBLIC_GUIDE_SHOP_ENABLED（預設 OFF）閘控：flag 未開時 /shop 回 404，
// 本 spec 開頭 probe 後自動 skip —— 要跑請用：
//   NEXT_PUBLIC_GUIDE_SHOP_ENABLED=1 npm run dev（或 PLAYWRIGHT_NO_WEBSERVER=1 對現成 server）
// 資料吃 in-memory fixtures（andy-lee＋柴山探洞方案），不需 Supabase。

const SLUG = 'andy-lee';

// 首次編譯公開 shop route 在冷快取環境可能超過 Playwright 預設 30 秒；
// 本檔覆蓋首頁與 book 深連結，保留同一明確上限避免誤判為頁面行為逾時。
test.setTimeout(180_000);

test('Andy Lee 商店首頁：公開行程卡可深連結到同一 activity＋plan，390px 可操作', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  const probe = await page.request.get(`/guides/${SLUG}/shop`);
  test.skip(probe.status() === 404, 'NEXT_PUBLIC_GUIDE_SHOP_ENABLED 未開，商店頁 404 — 本 smoke 需 flag-on server');

  await page.goto(`/guides/${SLUG}/shop`, { waitUntil: 'domcontentloaded' });

  // H1「線上預約」＋ hero ＋ 引路人徽章
  await expect(page.getByRole('heading', { level: 1 })).toContainText('線上預約');
  await expect(page.getByTestId('shop-hero')).toBeVisible();
  await expect(page.getByText('祕島引路人').first()).toBeVisible();

  // 預約三步驟區塊＋三個真實圖示（附件資產）
  await expect(page.getByText('預約三步驟')).toBeVisible();
  await expect(page.locator('.sib-step')).toHaveCount(3);
  await expect(page.locator('.sib-step-ico img').first()).toBeVisible();

  const publicPlanCard = page.getByTestId('shop-public-plan-card').first();
  await expect(publicPlanCard).toBeVisible();
  const activityTitle = (await publicPlanCard.locator('.sib-plan-t').innerText()).trim();
  const planName = (await publicPlanCard.getByTestId('shop-public-plan-name').innerText()).trim();
  expect(activityTitle).not.toBe('');
  expect(planName).not.toBe('');
  await expect(publicPlanCard).toHaveAttribute('href', new RegExp(`/guides/${SLUG}/shop/book\\?activityId=[^&]+&planId=.+`));

  await publicPlanCard.click({ noWaitAfter: true });
  // 冷快取的 /shop/book 首次編譯實測可能略過 30 秒；仍受本檔 180 秒總上限約束。
  await expect(page).toHaveURL(new RegExp(`/guides/${SLUG}/shop/book\\?activityId=[^&]+&planId=.+`), { timeout: 60_000 });
  await expect(page.getByTestId('shop-plan-summary')).toContainText(activityTitle, { timeout: 60_000 });
  await expect(page.getByTestId('shop-plan-summary')).toContainText(planName, { timeout: 60_000 });

  await page.goto(`/guides/${SLUG}/shop`, { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth),
  );

  // CTA「替我留一個位置」→ /shop/book
  const cta = page.getByRole('link', { name: /替我留一個位置/ });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', new RegExp(`/guides/${SLUG}/shop/book`));
  await cta.click({ noWaitAfter: true });
  await expect(page).toHaveURL(new RegExp(`/guides/${SLUG}/shop/book`), { timeout: 30_000 });
  expect(runtimeErrors).toEqual([]);
});

// 像素級比對用的固定 mock 頁（保留字 slug，見 src/fixtures/shop-landing-mock.mjs）：
// 內容／版面永遠固定，不受真實導遊資料影響，供 Playwright 疊圖比對使用。
const MOCK_SLUG = '__mock_landing__';

test('商店首頁 mock 對比頁：固定內容渲染正常（供像素級比對使用）', async ({ page }) => {
  const probe = await page.request.get(`/guides/${MOCK_SLUG}/shop`);
  test.skip(probe.status() === 404, 'NEXT_PUBLIC_GUIDE_SHOP_ENABLED 未開，商店頁 404 — 本 smoke 需 flag-on server');

  await page.goto(`/guides/${MOCK_SLUG}/shop`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { level: 1 })).toContainText('線上預約');
  await expect(page.getByTestId('shop-hero')).toBeVisible();
  await expect(page.getByText('高雄市', { exact: false })).toBeVisible();
  await expect(page.getByText('Andy Lee')).toBeVisible();
  await expect(page.getByText('祕島引路人')).toBeVisible();
  await expect(page.locator('.sib-step')).toHaveCount(3);
  await expect(page.getByRole('link', { name: /替我留一個位置/ })).toBeVisible();
});

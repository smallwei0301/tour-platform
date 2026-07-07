import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * 會員中心（我的訂單／我的最愛）UI 重做：與主站一致的深綠主題、Noto Serif TC 標題、
 * tp-card 元件、黃銅 active 分頁；響應式不破框/破圖。
 * 以 page.route mock backend、setTravelerSession 過登入 gate（不碰真實 Supabase）。
 */

const ORDERS = [
  { id: '11110000-aaaa-4bbb-8ccc-000000000001', status: 'completed', totalTwd: 3600, title: 'test-2-柴山秘境之旅｜龍谷、小錐麓、金瓜洞全探索（超長標題測試不破框）', peopleCount: 2, createdAt: '2026-05-01T00:00:00Z' },
  { id: '11110000-aaaa-4bbb-8ccc-000000000002', status: 'pending_payment', totalTwd: 1800, title: '大稻埕老街漫步', peopleCount: 1, createdAt: '2026-04-20T00:00:00Z' },
];

const WISHLIST = [
  { id: 'w1', activityId: 'a1', addedAt: '2026-05-01', title: '柴山秘境之旅｜龍谷、小錐麓、金瓜洞全探索（超長標題測試兩行截斷不破框）', slug: 'kaohsiung-chaishan-cave-experience', priceTwd: 1800, coverImageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=600&q=70' },
  { id: 'w2', activityId: 'a2', addedAt: '2026-04-20', title: '花蓮溯溪', slug: 'hualien-river-trekking', priceTwd: 2600, coverImageUrl: null },
];

function darkText(rgb: string) {
  // var(--tp-text) 深綠主題 = #efe9d3 → rgb(239, 233, 211)
  return rgb.replace(/\s/g, '') === 'rgb(239,233,211)';
}

test.describe('會員中心 UI 重做（深綠主題一致）', () => {
  test('我的訂單：深綠主題 + serif 標題 + tp-card 卡片 + 分頁', async ({ page }) => {
    await setTravelerSession(page);
    await page.route('**/api/v2/orders**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: ORDERS }) });
    });

    await page.goto('/me/orders');

    const title = page.getByTestId('my-orders-title');
    await expect(title).toBeVisible({ timeout: 10_000 });
    // 深綠主題：標題用淺色文字（非古紙深灰）
    const color = await title.evaluate((el) => getComputedStyle(el).color);
    expect(darkText(color)).toBe(true);
    // serif 標題
    const font = await title.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font).toMatch(/Serif/i);

    // 分頁：我的訂單為 active
    await expect(page.getByTestId('member-tab-orders')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('member-tab-wishlist')).toHaveAttribute('href', '/me/wishlist');

    // 卡片渲染
    const items = page.getByTestId('order-list-item');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('NT$');
  });

  test('我的最愛：卡片含封面圖、兩行截斷標題、移除鈕，分頁 active', async ({ page }) => {
    await setTravelerSession(page);
    await page.route('**/api/me/wishlist', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: WISHLIST }) });
    });

    await page.goto('/me/wishlist');

    await expect(page.getByTestId('my-wishlist-title')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('member-tab-wishlist')).toHaveAttribute('aria-current', 'page');

    const items = page.getByTestId('wishlist-item');
    await expect(items).toHaveCount(2);
    // 第一筆有封面圖
    await expect(items.first().locator('img')).toBeVisible();
    // 移除鈕
    await expect(items.first().getByRole('button', { name: /移除/ })).toBeVisible();
  });

  test('手機視窗：兩頁皆不水平溢出（不破框）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setTravelerSession(page);
    await page.route('**/api/v2/orders**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: ORDERS }) });
    });
    await page.route('**/api/me/wishlist', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: WISHLIST }) });
    });
    // deflake：本測試用 networkidle，外部資源（unsplash 圖、Vercel Analytics debug
    // scripts）在無外網／無 proxy 的環境會掛住請求導致 networkidle 永不觸發（30s 逾時）。
    // 以 1x1 PNG 回應外部圖、abort analytics scripts——斷言的是版面不溢出，與外部內容無關。
    const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.route('**://images.unsplash.com/**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX });
    });
    await page.route('**://va.vercel-scripts.com/**', (route: Route) => route.abort());

    for (const path of ['/me/orders', '/me/wishlist']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} 不應水平溢出`).toBeLessThanOrEqual(1);
    }
  });
});

import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Issue #1381 — Promo code 旅客端曝光：活動頁 banner + checkout 一鍵套用。
 * /api/v2/promo-codes/public 與 /validate 以 page.route mock；活動資料用
 * in-memory fixture（kaohsiung-chaishan-cave-experience，priceTwd 2000）。
 */

const PUBLIC_PROMOS = {
  ok: true,
  data: [
    { code: 'WELCOME10', discountType: 'percentage', discountValue: 10, label: '新客限定 9 折', expiresAt: null },
  ],
};

test.describe('issue1381 promo exposure', () => {
  test('活動頁顯示公開促銷碼 banner（label + code）', async ({ page }) => {
    await page.route('**/api/v2/promo-codes/public**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PUBLIC_PROMOS) });
    });

    await page.goto('/activities/kaohsiung/kaohsiung-chaishan-cave-experience');
    const banner = page.locator('[data-testid="public-promo-banner"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText('新客限定 9 折');
    await expect(banner).toContainText('WELCOME10');
  });

  test('無公開碼時活動頁不渲染 banner', async ({ page }) => {
    await page.route('**/api/v2/promo-codes/public**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
    });

    await page.goto('/activities/kaohsiung/kaohsiung-chaishan-cave-experience');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="public-promo-banner"]')).toHaveCount(0);
  });

  test('/checkout 入口退役殘留守門：308 → V2 booking、不復活 legacy 促銷輸入', async ({ page }) => {
    // #1407 legacy checkout（含 promo-code-input 一鍵套用 UI）已退役；/checkout 由
    // next.config 永久重導至 V2 booking 頁。V2 訂購鏈目前無促銷碼輸入
    // （/api/promo-codes/validate 零前端消費者）——公開碼曝光由活動頁 banner 承擔
    // （本檔 T1/T2）。一鍵套用若要回歸，屬 V2 booking 功能增項（另案），
    // 本測試守住「retired UI 不半殘回流」。
    await setTravelerSession(page);
    await page.route('**/api/v2/promo-codes/public**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PUBLIC_PROMOS) });
    });

    await page.goto('/checkout?slug=kaohsiung-chaishan-cave-experience');
    await expect(page).toHaveURL(/\/booking\/kaohsiung-chaishan-cave-experience/);
    await expect(page.locator('[data-testid="promo-code-input"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="public-promo-WELCOME10"]')).toHaveCount(0);
  });
});

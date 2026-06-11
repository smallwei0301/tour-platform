import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Issue #1381 — Promo code 旅客端曝光：活動頁 banner + checkout 一鍵套用。
 * /api/promo-codes/public 與 /validate 以 page.route mock；活動資料用
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
    await page.route('**/api/promo-codes/public**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PUBLIC_PROMOS) });
    });

    await page.goto('/activities/kaohsiung/kaohsiung-chaishan-cave-experience');
    const banner = page.locator('[data-testid="public-promo-banner"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText('新客限定 9 折');
    await expect(banner).toContainText('WELCOME10');
  });

  test('無公開碼時活動頁不渲染 banner', async ({ page }) => {
    await page.route('**/api/promo-codes/public**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
    });

    await page.goto('/activities/kaohsiung/kaohsiung-chaishan-cave-experience');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="public-promo-banner"]')).toHaveCount(0);
  });

  test('checkout 一鍵套用：點公開碼 → 輸入框帶入 → 折扣金額顯示', async ({ page }) => {
    await setTravelerSession(page);
    await page.route('**/api/promo-codes/public**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PUBLIC_PROMOS) });
    });

    let validatedCode: string | null = null;
    await page.route('**/api/promo-codes/validate', async (route: Route) => {
      const body = route.request().postDataJSON() as { code?: string };
      validatedCode = body?.code ?? null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ valid: true, discountAmount: 200, discountedTotal: 1800 }),
      });
    });

    await page.goto('/checkout?slug=kaohsiung-chaishan-cave-experience');

    const chip = page.locator('[data-testid="public-promo-WELCOME10"]');
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await chip.click();

    await expect(page.locator('[data-testid="promo-code-input"]')).toHaveValue('WELCOME10');
    await expect(page.getByText(/折扣 NT\$ ?200/)).toBeVisible();
    expect(validatedCode).toBe('WELCOME10');
  });
});

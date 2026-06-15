import { test, expect, setTravelerSession } from './helpers';

/**
 * 旅客導覽列加「我的最愛」入口（連到 /me/wishlist），桌機帳號區與手機選單都要有。
 * Navbar 以 supabase.auth.getUser() 判斷登入；setTravelerSession 播種假 session 即可
 * 讓登入後的帳號區渲染（不碰真實 Supabase）。
 */

test.describe('導覽列「我的最愛」入口', () => {
  test('桌機帳號區：登入後顯示「我的最愛」並連到 /me/wishlist', async ({ page }) => {
    await setTravelerSession(page);
    await page.goto('/');

    const link = page.getByTestId('nav-my-wishlist');
    await expect(link).toBeVisible({ timeout: 10_000 });
    await expect(link).toHaveText('我的最愛');
    await expect(link).toHaveAttribute('href', '/me/wishlist');
    // 仍保留「我的訂單」
    await expect(page.getByTestId('nav-my-orders')).toBeVisible();
  });

  test('手機選單：登入後顯示「我的最愛」並連到 /me/wishlist', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setTravelerSession(page);
    await page.goto('/');

    // 開啟漢堡選單
    await page.getByRole('button', { name: '開啟選單' }).click();
    const link = page.getByTestId('nav-mobile-my-wishlist');
    await expect(link).toBeVisible({ timeout: 10_000 });
    await expect(link).toHaveText('我的最愛');
    await expect(link).toHaveAttribute('href', '/me/wishlist');
  });

  test('未登入：不顯示「我的最愛」入口', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('nav-my-wishlist')).toHaveCount(0);
  });
});

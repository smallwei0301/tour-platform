import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * 收藏愛心點擊行為（真實瀏覽器）。
 *
 * 回歸 bug：列表頁先前用 cookie sniff 判斷登入，對 httpOnly／分段 cookie 會誤判，
 * 導致「不管有沒有登入，點愛心都跳登入頁」。修正後改以 supabase.auth.getUser()
 * 為唯一真實來源（useTravelerAuth），並以 API 401 為輔助判準。
 *
 * 詳情頁/列表頁為 server render（dev 走 in-memory fixture），卡片真實存在；
 * auth 與 wishlist API 以 page.route mock，不碰真實 Supabase。
 */

const REGION_PATH = '/activities/kaohsiung';

test.describe('收藏愛心點擊行為', () => {
  test('已登入：點愛心 → 不跳登入頁、樂觀標記為已收藏、呼叫收藏 API', async ({ page }) => {
    await setTravelerSession(page); // 假 session + 攔截 auth/v1/user 回傳 user
    await page.route('**/api/me/wishlist/ids**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    });
    let postCalled = false;
    await page.route('**/api/me/wishlist', async (route: Route) => {
      postCalled = true;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { id: 'w1' } }) });
    });

    await page.goto(REGION_PATH);
    const card = page.locator('[data-testid="activity-card"]', { hasText: '柴山' }).first();
    const heart = card.locator('[data-testid="wishlist-toggle"]');
    await expect(heart).toBeVisible({ timeout: 10_000 });
    await expect(heart).toHaveAttribute('aria-pressed', 'false');

    await heart.click();

    // 已收藏（aria-pressed=true），且 URL 沒有跳到 /login
    await expect(heart).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    expect(page.url()).not.toContain('/login');
    expect(postCalled).toBe(true);
  });

  test('未登入/session 失效：點愛心 → 導向 /login（帶 next 回導參數）', async ({ page }) => {
    // 先播種 session 讓 getUser 會去打 auth/v1/user，再覆蓋該 endpoint 回 401
    // （模擬未登入／session 失效；後註冊的 route 優先）→ authed=false → 應導向 /login。
    await setTravelerSession(page);
    // 覆蓋整個 /auth/v1/*（user 與 token refresh）回 401，避免 token 刷新打不到真實
    // 主機而 hang；getUser 解析為 null → authed=false。
    await page.route('**/auth/v1/**', async (route: Route) => {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'no session' }) });
    });
    await page.route('**/api/me/wishlist/ids**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    });

    // 用「未預套地區」的 /activities，避免地區頁的 URL 同步（router.replace 成
    // /activities?region=…）與登入導向競爭蓋掉斷言。
    await page.goto('/activities');
    const heart = page.locator('[data-testid="activity-card"]').first().locator('[data-testid="wishlist-toggle"]');
    await expect(heart).toBeVisible({ timeout: 10_000 });
    // 等列表首屏的 /api/activities 抓取與 getUser 解析穩定，避免卡片重渲染吃掉點擊。
    await page.waitForLoadState('networkidle');

    await heart.click();

    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');
    expect(page.url()).toContain('next=');
  });
});

import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * 「我的最愛」(/me/wishlist) 的行程連結必須是 canonical 詳情頁路徑
 * /activities/<region>/<slug>。少了 region 的 /activities/<slug> 會先打到
 * [region] 相容頁，做一次 slug→activity 查詢後 302 轉址，點擊載入過久。
 *
 * 連結由前端 buildActivityHref 以 API 回傳的 region/regionSlug 組成，故用真實
 * 瀏覽器驗證 href（setTravelerSession 過登入 gate、page.route mock backend）。
 */

const WISHLIST = [
  // 帶 regionSlug → 直接採用
  { id: 'w1', activityId: 'a1', addedAt: '2026-06-05T00:00:00Z', title: '柴山秘境之旅', slug: 'chaishan-cave', priceTwd: 1200, coverImageUrl: null, region: '高雄市', regionSlug: 'kaohsiung' },
  // 只有中文 region（無 regionSlug）→ 正規化成英文 segment
  { id: 'w2', activityId: 'a2', addedAt: '2026-06-04T00:00:00Z', title: '花蓮溯溪', slug: 'hualien-river', priceTwd: 1800, coverImageUrl: null, region: '花蓮', regionSlug: null },
];

test.describe('我的最愛：canonical 行程連結', () => {
  test('行程連結為 /activities/<region>/<slug>，不得 region-less', async ({ page }) => {
    await setTravelerSession(page);
    await page.route('**/api/me/wishlist', (r: Route) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: WISHLIST }) }),
    );

    await page.goto('/me/wishlist');

    const items = page.getByTestId('wishlist-item');
    await expect(items).toHaveCount(2, { timeout: 10_000 });

    // 每張卡片內所有行程連結都應指向 canonical 路徑
    const hrefs = await page.locator('[data-testid="wishlist-item"] a[href^="/activities/"]').evaluateAll(
      (els) => els.map((el) => el.getAttribute('href')),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      // 必須是 /activities/<region>/<slug>（三段），不得是 region-less 的 /activities/<slug>
      expect(href).toMatch(/^\/activities\/[^/]+\/[^/]+$/);
    }
    expect(hrefs).toContain('/activities/kaohsiung/chaishan-cave');
    expect(hrefs).toContain('/activities/hualien/hualien-river');
  });
});

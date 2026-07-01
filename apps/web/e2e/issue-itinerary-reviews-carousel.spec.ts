import { test, expect } from '@playwright/test';

/**
 * 行程頁「旅客評價」改為左右滑動的卡片輪播。
 *
 * 詳情頁為 server render；dev 無 Supabase env 時走 in-memory fixture
 * （`src/fixtures/data.ts` 的 kaohsiung-chaishan-cave-experience：4 真實評論 + 4 口碑語錄），
 *   故不需 page.route mock。
 */

const DETAIL_PATH = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';

test.describe('旅客評價左右滑動輪播', () => {
  test('評價清單為橫向卷軸（overflow-x + scroll-snap），非垂直堆疊', async ({ page }) => {
    await page.goto(DETAIL_PATH);

    const list = page.locator('#section-reviews .kkd-review-list');
    await expect(list).toBeVisible({ timeout: 10_000 });

    const styles = await list.evaluate((el) => {
      const s = getComputedStyle(el);
      return { overflowX: s.overflowX, display: s.display, snap: s.scrollSnapType };
    });
    expect(['auto', 'scroll']).toContain(styles.overflowX);
    expect(styles.display).toBe('flex');
    expect(styles.snap).toContain('x');
  });

  test('評價卡並排於同一列且可橫向捲動（scrollWidth 大於可視寬度）', async ({ page }) => {
    await page.goto(DETAIL_PATH);

    const list = page.locator('#section-reviews .kkd-review-list');
    await expect(list).toBeVisible({ timeout: 10_000 });

    // fixture 有 8 則評價，卡片固定寬度並排，內容寬度應超過容器可視寬度 → 可左右滑動
    const { scrollWidth, clientWidth } = await list.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    // 第一、二張卡片的 y 座標相同（並排，非上下堆疊）
    const cards = list.locator('.kkd-review-card');
    await expect(cards.nth(1)).toBeAttached();
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first && second).toBeTruthy();
    expect(Math.abs((first!.y) - (second!.y))).toBeLessThan(4);
    expect(second!.x).toBeGreaterThan(first!.x);
  });

  test('程式化橫向捲動會移動卷軸位置（可左右滑動）', async ({ page }) => {
    await page.goto(DETAIL_PATH);

    const list = page.locator('#section-reviews .kkd-review-list');
    await expect(list).toBeVisible({ timeout: 10_000 });

    const before = await list.evaluate((el) => el.scrollLeft);
    await list.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    const after = await list.evaluate((el) => el.scrollLeft);
    expect(after).toBeGreaterThan(before);
  });

  test('手機視窗下評價輪播不溢出版面', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(DETAIL_PATH);

    const list = page.locator('#section-reviews .kkd-review-list');
    await expect(list).toBeVisible({ timeout: 10_000 });

    const overflowX = await list.evaluate((el) => getComputedStyle(el).overflowX);
    expect(['auto', 'scroll']).toContain(overflowX);
    const box = await list.boundingBox();
    expect(box?.width ?? 999).toBeLessThanOrEqual(390);
  });
});

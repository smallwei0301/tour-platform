import { test, expect } from '@playwright/test';

/**
 * 方案卡片響應式版型：非手機依螢幕寬度多欄並排（不再單欄、卡片右側大片留白）；
 * 手機收合時只顯示前 2 個方案，「查看更多方案」展開其餘。
 *
 * dev（無 Supabase）沒有 V2 activity_plans 種子資料，詳情頁會顯示「尚無方案」訊息、
 * 不渲染方案卡（NOT_AUTOMATABLE：本機無法產生真實 V2 方案卡）。因此本 spec 先載入
 * 詳情頁以取得「實際編譯後的 globals.css」，再注入與元件相同 class 結構的方案卡 DOM，
 * 對真實樣式規則做量測——驗的是本次改動的 CSS 契約本身（.kkd-plans-list grid / 手機收合 /
 * footer 直排 / 切換鈕在非手機隱藏）。元件的 render-all + show-all class 行為另由
 * tests/ui/issue-plans-grid-render-all.test.mjs（source-contract）鎖定。
 */

const DETAIL_PATH = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';

// 與 DatePlanSection 產出的 markup 同構（含 footer 價格＋CTA），共 6 張卡。
const PLANS_MARKUP = (showAll: boolean) => `
  <div class="kkd-plans-list${showAll ? ' show-all' : ''}" id="test-plans-list">
    ${Array.from({ length: 6 }).map((_, i) => `
      <div class="kkd-plan-card">
        <div class="kkd-plan-header"><div><span class="kkd-plan-name">方案 ${i + 1}</span></div></div>
        <ul class="kkd-plan-notice-list"><li class="kkd-plan-notice-item"><span>重點 A</span></li></ul>
        <div class="kkd-plan-footer">
          <div class="kkd-plan-price-block"><strong class="kkd-plan-price">NT$${(i + 1) * 1000}</strong></div>
          <a class="tp-btn tp-btn-primary kkd-plan-select-btn">立即預約</a>
        </div>
      </div>`).join('')}
  </div>
  <div class="kkd-plans-more-btn-wrap" id="test-more-wrap"><button class="kkd-more-dates-btn">查看更多方案</button></div>
`;

async function injectPlans(page: import('@playwright/test').Page, showAll = false) {
  await page.evaluate((html) => {
    document.querySelectorAll('#test-plans-host').forEach((n) => n.remove());
    const host = document.createElement('div');
    host.id = 'test-plans-host';
    host.innerHTML = html;
    document.body.appendChild(host);
  }, PLANS_MARKUP(showAll));
}

function trackCount(gridTemplateColumns: string) {
  // 'none' → 1；否則計算 track 數（以空白分隔）
  if (!gridTemplateColumns || gridTemplateColumns === 'none') return 1;
  return gridTemplateColumns.trim().split(/\s+/).length;
}

test.describe('方案卡片響應式版型', () => {
  test('桌機（1280）：多欄並排、全部方案顯示、footer 直排、切換鈕隱藏', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(DETAIL_PATH);
    await page.waitForLoadState('domcontentloaded');
    await injectPlans(page, false);

    const list = page.locator('#test-plans-list');
    const cols = await list.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    expect(trackCount(cols)).toBeGreaterThan(1); // 多欄並排

    // 全部 6 張卡皆可見（非手機不收合）
    await expect(list.locator('.kkd-plan-card')).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      await expect(list.locator('.kkd-plan-card').nth(i)).toBeVisible();
    }

    // 窄欄 footer 改直排
    const footerDir = await list.locator('.kkd-plan-footer').first().evaluate((el) => getComputedStyle(el).flexDirection);
    expect(footerDir).toBe('column');

    // 「查看更多」切換鈕在非手機隱藏
    await expect(page.locator('#test-more-wrap')).toBeHidden();
  });

  test('手機（390）收合：只顯示前 2 個方案、單欄、切換鈕可見', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(DETAIL_PATH);
    await page.waitForLoadState('domcontentloaded');
    await injectPlans(page, false);

    const list = page.locator('#test-plans-list');
    const cols = await list.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    expect(trackCount(cols)).toBe(1); // 單欄

    const cards = list.locator('.kkd-plan-card');
    await expect(cards.nth(0)).toBeVisible();
    await expect(cards.nth(1)).toBeVisible();
    await expect(cards.nth(2)).toBeHidden(); // 第 3 張以後收合
    await expect(cards.nth(5)).toBeHidden();

    await expect(page.locator('#test-more-wrap')).toBeVisible();
  });

  test('手機（390）展開（show-all）：全部方案顯示', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(DETAIL_PATH);
    await page.waitForLoadState('domcontentloaded');
    await injectPlans(page, true);

    const cards = page.locator('#test-plans-list .kkd-plan-card');
    for (let i = 0; i < 6; i++) {
      await expect(cards.nth(i)).toBeVisible();
    }
  });
});

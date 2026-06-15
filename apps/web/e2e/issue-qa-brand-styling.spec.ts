import { test, expect } from '@playwright/test';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3333';

/**
 * 行程頁面「旅客問答」(Q&A) 必須沿用站內 UI 配色／字體，與「常見問題」(FAQ) 一致。
 * 截圖問題：問答框是白底黑字、與深色品牌主題不符。
 * 本 smoke 在真實瀏覽器中比對 .kkd-qa-item 與 .kkd-faq-item 的 computed 樣式，
 * 確認問答卡片背景／文字色已採用品牌色（深綠卡片＋米色文字），而非白底。
 */
test.describe('行程頁面 旅客問答 配色與 FAQ 一致', () => {
  let slug: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/activities`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.data || [];
    slug = items[0]?.slug || 'kaohsiung-chaishan-cave-experience';
  });

  test('Q&A 卡片背景／文字色與 FAQ 卡片相同（非白底黑字）', async ({ page }) => {
    // 回傳一筆 approved Q&A，讓 .kkd-qa-item 渲染
    await page.route('**/api/qa**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'qa-1', question: 'Hi', answer: 'hi', status: 'approved' }],
        }),
      }),
    );

    await page.goto(`${BASE_URL}/activities/kaohsiung/${slug}`);

    const qaItem = page.locator('.kkd-qa-item').first();
    await expect(qaItem).toBeVisible({ timeout: 15000 });

    const qaBg = await qaItem.evaluate(el => getComputedStyle(el).backgroundImage + getComputedStyle(el).backgroundColor);
    const qaColor = await page.locator('.kkd-qa-q').first().evaluate(el => getComputedStyle(el).color);

    // FAQ 卡片若存在則直接比對；否則用品牌 token 斷言
    const faqCount = await page.locator('.kkd-faq-item').count();
    if (faqCount > 0) {
      const faqBg = await page.locator('.kkd-faq-item').first().evaluate(el => getComputedStyle(el).backgroundImage + getComputedStyle(el).backgroundColor);
      const faqColor = await page.locator('.kkd-faq-q').first().evaluate(el => getComputedStyle(el).color);
      expect(qaBg).toBe(faqBg);
      expect(qaColor).toBe(faqColor);
    }

    // 不應是白底（截圖中的 #f9fafb / white）
    expect(qaBg).not.toContain('rgb(249, 250, 251)');
    expect(qaBg).not.toContain('rgb(255, 255, 255)');
    // 深綠卡片漸層應含 gradient
    expect(qaBg).toContain('gradient');
    // 文字色為米色系（高亮度），非深灰 #111827
    expect(qaColor).not.toBe('rgb(17, 24, 39)');
  });
});

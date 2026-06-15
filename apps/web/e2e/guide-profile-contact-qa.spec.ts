import { test, expect } from '@playwright/test';

/**
 * 認識導遊頁（/guides/[slug]）的「詢問導遊」按鈕修復。
 *
 * 舊行為：sidebar 的「傳訊息給導遊」是死按鈕（無 handler，server component），按下去沒反應。
 * 新行為：改為 <Link>，導向導遊主行程詳情頁的「旅客問答」區塊（#section-qa）——
 *         即站上訂單前與導遊互動的諮詢管道（activity_qa / ActivityQASection / /api/qa）。
 *
 * 用 fixtures fallback（dev server 無 Supabase env）渲染 andy-lee，其主行程為
 * kaohsiung-chaishan-cave-experience（高雄市 → /activities/kaohsiung/...）。
 */
test.describe('導遊頁「詢問導遊」導向行程問答', () => {
  test('點擊「詢問導遊」導向主行程的 #section-qa 並顯示旅客問答', async ({ page }) => {
    await page.goto('/guides/andy-lee');

    const contactCta = page.getByRole('link', { name: /詢問導遊/ });
    await expect(contactCta).toBeVisible();

    const href = await contactCta.getAttribute('href');
    expect(href).toContain('/activities/');
    expect(href).toContain('#section-qa');

    await contactCta.click();

    // 導向行程詳情頁並落在旅客問答區塊
    await expect(page).toHaveURL(/\/activities\/[^/]+\/[^/#]+#section-qa$/);
    await expect(page.locator('#section-qa')).toBeVisible();
    await expect(
      page.locator('#section-qa').getByText('旅客問答'),
    ).toBeVisible();
  });

  test('行程詳情頁的「詢問導遊」錨點滾動到旅客問答區塊', async ({ page }) => {
    await page.goto('/activities/kaohsiung/kaohsiung-chaishan-cave-experience');

    const askCta = page.getByRole('link', { name: /詢問導遊/ });
    await expect(askCta).toBeVisible();
    await expect(askCta).toHaveAttribute('href', '#section-qa');

    await askCta.click();
    await expect(page).toHaveURL(/#section-qa$/);
    await expect(page.locator('#section-qa')).toBeVisible();
  });
});

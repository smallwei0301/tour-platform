import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * 認識導遊頁（/guides/[slug]）的「詢問導遊」inline 訊息（真實 browser smoke）。
 *
 * 需求：按下 sidebar「詢問導遊」先判斷旅客是否登入。
 *  - 已登入 → 就地展開和行程 QA 一樣的輸入框，送出後顯示等候回覆。
 *  - 未登入 → 展開登入提示。
 *
 * 訊息走既有 /api/qa（activity_id 帶 sentinel guide:<guideId>）；本測試以
 * page.route mock /api/qa，不依賴 Supabase。andy-lee 由 fixtures fallback 渲染。
 */
test.describe('導遊頁「詢問導遊」inline 訊息', () => {
  test('未登入：點擊展開登入提示（不顯示輸入框）', async ({ page }) => {
    await page.goto('/guides/andy-lee');

    const cta = page.getByRole('button', { name: /詢問導遊/ });
    await expect(cta).toBeVisible();
    await cta.click();

    await expect(page.getByTestId('guide-qa-login-prompt')).toBeVisible();
    await expect(page.locator('#guide-qa-question-input')).toHaveCount(0);
  });

  test('已登入：點擊展開輸入框 → 送出 → 顯示等候回覆，且帶 sentinel activityId', async ({ page }) => {
    await setTravelerSession(page);

    // 已審核訊息查詢（空）＋ 送出攔截
    await page.route('**/api/qa?activityId=*', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
    });
    let submitted: Record<string, unknown> | null = null;
    await page.route('**/api/qa', async (route: Route) => {
      if (route.request().method() === 'POST') {
        submitted = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: { id: 'gqa-1', status: 'pending_moderation' } }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
      }
    });

    await page.goto('/guides/andy-lee');

    const cta = page.getByRole('button', { name: /詢問導遊/ });
    await cta.click();

    const textarea = page.locator('#guide-qa-question-input');
    await expect(textarea).toBeVisible();
    await textarea.fill('請問這個行程適合帶長輩嗎？');
    await page.getByRole('button', { name: '送出訊息' }).click();

    await expect(page.getByTestId('guide-qa-submitted')).toBeVisible();
    expect(submitted).not.toBeNull();
    expect(String(submitted!.activityId)).toMatch(/^guide:/);
    expect(submitted!.question).toBe('請問這個行程適合帶長輩嗎？');
  });
});

/**
 * 行程詳情頁的「詢問導遊」錨點仍滾動到旅客問答區塊（既有機制不退化）。
 */
test.describe('行程詳情頁「詢問導遊」錨點', () => {
  test('錨定 #section-qa 並顯示旅客問答', async ({ page }) => {
    await page.goto('/activities/kaohsiung/kaohsiung-chaishan-cave-experience');

    const askCta = page.getByRole('link', { name: /詢問導遊/ });
    await expect(askCta).toBeVisible();
    await expect(askCta).toHaveAttribute('href', '#section-qa');

    await askCta.click();
    await expect(page).toHaveURL(/#section-qa$/);
    await expect(page.locator('#section-qa')).toBeVisible();
  });
});

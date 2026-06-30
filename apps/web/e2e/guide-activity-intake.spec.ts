import { test, expect } from '@playwright/test';

/**
 * 導遊新行程投稿頁 /guide/new-activity
 * - 公開頁（middleware allowlist），不需登入
 * - 送出後 POST /api/guide-activity-intake（此處 mock 後端），顯示成功畫面
 */
test.describe('導遊新行程投稿 — /guide/new-activity', () => {
  test('填寫必填欄位並送出 → 顯示成功畫面，且送出正確 payload', async ({ page }) => {
    let captured: Record<string, unknown> | null = null;

    await page.route('**/api/guide-activity-intake', async (route) => {
      captured = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { received: true, recipients: 1, delivered: 1 } }),
      });
    });

    await page.goto('/guide/new-activity');

    await expect(page.getByRole('heading', { name: '投稿一條新行程' })).toBeVisible();

    await page.fill('#f-title', '柴山秘境之旅｜龍谷、小錐麓、金瓜洞全探索');
    await page.selectOption('#f-region', '高雄市');
    await page.selectOption('#f-category', 'mountain');
    await page.fill('#f-price', '1800');
    await page.fill('#f-duration', '4.5 小時');
    await page.fill('#f-meeting', '柴山壽山動物園停車場旁（龍門亭入口）');
    await page.fill('#f-desc', '帶旅客走柴山一般人不知道的三個秘境：龍谷大峽谷、小錐麓窄道、金瓜洞，沿途有獼猴與高雄港全景。');
    await page.fill('#f-gname', 'Andy Lee');

    await page.getByRole('button', { name: '送出行程內容' }).click();

    await expect(page.getByRole('heading', { name: '收到你的行程內容了！' })).toBeVisible();

    expect(captured).toMatchObject({
      title: '柴山秘境之旅｜龍谷、小錐麓、金瓜洞全探索',
      region: '高雄市',
      category: 'mountain',
      priceTwd: '1800',
      durationText: '4.5 小時',
      guideName: 'Andy Lee',
    });
  });

  test('地區可選全台縣市並複選附加地區 → payload 帶 regions（排除主要地區）', async ({ page }) => {
    let captured: Record<string, unknown> | null = null;

    await page.route('**/api/guide-activity-intake', async (route) => {
      captured = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { received: true, recipients: 1, delivered: 1 } }),
      });
    });

    await page.goto('/guide/new-activity');

    // 過去硬編 8 個縣市無台東縣；擴充後可作為主要地區
    await page.selectOption('#f-region', '台東縣');
    await page.selectOption('#f-category', 'culture');

    // 附加地區複選：勾選台北市與花蓮縣
    await page.locator('input[type="checkbox"][value="台北市"]').check();
    await page.locator('input[type="checkbox"][value="花蓮縣"]').check();
    // 主要地區（台東縣）不應出現在複選清單
    await expect(page.locator('input[type="checkbox"][value="台東縣"]')).toHaveCount(0);

    await page.fill('#f-title', '縱谷文化走讀');
    await page.fill('#f-price', '2200');
    await page.fill('#f-duration', '一整天');
    await page.fill('#f-meeting', '台東火車站');
    await page.fill('#f-desc', '帶旅客走訪縱谷的部落與老街，認識在地文化與歷史，沿途品嘗在地風味。');

    await page.getByRole('button', { name: '送出行程內容' }).click();
    await expect(page.getByRole('heading', { name: '收到你的行程內容了！' })).toBeVisible();

    expect(captured).toMatchObject({ region: '台東縣' });
    expect((captured as unknown as { regions?: string[] }).regions).toEqual(
      expect.arrayContaining(['台北市', '花蓮縣']),
    );
    expect((captured as unknown as { regions?: string[] }).regions).not.toContain('台東縣');
  });

  test('後端回 400 驗證錯誤 → 顯示錯誤訊息且不進成功畫面', async ({ page }) => {
    await page.route('**/api/guide-activity-intake', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: '行程內容描述（description）為必填' } }),
      });
    });

    await page.goto('/guide/new-activity');
    await page.fill('#f-title', '測試');
    await page.selectOption('#f-region', '高雄市');
    await page.selectOption('#f-category', 'mountain');
    await page.fill('#f-price', '1800');
    await page.fill('#f-duration', '4 小時');
    await page.fill('#f-meeting', '集合點');
    await page.fill('#f-desc', '太短');

    await page.getByRole('button', { name: '送出行程內容' }).click();

    await expect(page.getByRole('alert').filter({ hasText: '必填' })).toContainText('description');
    await expect(page.getByRole('heading', { name: '收到你的行程內容了！' })).toHaveCount(0);
  });
});

import { test, expect, setGuideSession } from './helpers';

/**
 * 導遊申請熟悉區域擴充（全台 18 區，含嘉義／屏東）＋ 收款方式可複選；
 * 導遊後台「服務地區→熟悉區域」、新增專業證照／收款方式且可自行修改。
 *
 * 申請表單純前端（送出才打 API），故無須 mock 後端即可驗 chips／checkbox。
 * 導遊後台 profile 需 guide session + 攔截 GET/PATCH /api/guide/profile。
 */

test.describe('導遊申請表單：熟悉區域與收款方式', () => {
  test('熟悉區域涵蓋全台（含嘉義、屏東），收款方式可複選', async ({ page }) => {
    await page.goto('/guide/apply');

    // 熟悉區域：嘉義、屏東等地區皆可選。
    const regionGroup = page.locator('.lp-apply-chips').filter({ hasText: '嘉義' }).first();
    await expect(page.getByText('熟悉區域*')).toBeVisible();
    for (const region of ['嘉義', '屏東', '基隆', '宜蘭', '澎湖']) {
      await expect(regionGroup.getByText(region, { exact: true })).toBeVisible();
    }

    // 收款方式：checkbox（可複選），預設「銀行轉帳」勾選，可再加 LINE Pay。
    await expect(page.getByText('收款方式*（可複選）')).toBeVisible();
    const bank = page.getByRole('checkbox', { name: '銀行轉帳' });
    const linepay = page.getByRole('checkbox', { name: 'LINE Pay' });
    await expect(bank).toBeChecked();
    await linepay.check();
    await expect(bank).toBeChecked();
    await expect(linepay).toBeChecked();
  });
});

test.describe('導遊後台：熟悉區域／專業證照／收款方式可自行修改', () => {
  const GUIDE_ID = 'guide-e2e-regions';

  test.beforeEach(async ({ page }) => {
    await setGuideSession(page, GUIDE_ID);
    await page.route('**/api/guide/auth/csrf**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.route('**/api/guide/profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            data: {
              display_name: '柴山阿賢',
              headline: '在地嚮導',
              bio: '十年帶團經驗',
              region: '高雄',
              regions: ['高雄', '屏東'],
              certifications: ['導遊證', '急救證照'],
              payment_methods: ['bank'],
              languages: ['中文', '英文'],
              specialties: ['生態導覽'],
              profile_photo_url: null,
              hero_image_url: null,
              gallery_urls: [],
              slug: 'guide-e2e',
              is_published: true,
              bank_name: '', account_name: '', account_number: '', transfer_note: '',
            },
          }),
        });
        return;
      }
      // PATCH：回成功，spec 另行斷言送出的 body。
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { updated: true } }) });
    });
  });

  test('帶入申請資料、標題為熟悉區域、可勾選新增並儲存', async ({ page }) => {
    await page.goto('/guide/profile');

    // 標題由「服務地區」改為「熟悉區域」。
    await expect(page.getByText('熟悉區域', { exact: true })).toBeVisible();
    await expect(page.getByText('服務地區')).toHaveCount(0);

    // 申請帶入的熟悉區域已預選（高雄、屏東 active）。
    const regionGroup = page.getByRole('group', { name: '熟悉區域' });
    await expect(regionGroup.getByRole('button', { name: '✓ 高雄' })).toBeVisible();
    await expect(regionGroup.getByRole('button', { name: '✓ 屏東' })).toBeVisible();

    // 專業證照已帶入（chip 以「移除 <值>」按鈕呈現）。
    await expect(page.getByText('專業證照', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '移除 導遊證' })).toBeVisible();
    await expect(page.getByRole('button', { name: '移除 急救證照' })).toBeVisible();

    // 收款方式可複選：再加 LINE Pay。
    const payGroup = page.getByRole('group', { name: '收款方式' });
    await payGroup.getByRole('button', { name: 'LINE Pay' }).click();

    // 新增一個熟悉區域（台南），送出 PATCH 應帶 regions/certifications/payment_methods。
    await regionGroup.getByRole('button', { name: '台南', exact: true }).click();

    const patchPromise = page.waitForRequest((req) =>
      req.url().includes('/api/guide/profile') && req.method() === 'PATCH');
    await page.getByRole('button', { name: /儲存/ }).first().click();
    const patch = await patchPromise;
    const body = JSON.parse(patch.postData() || '{}');
    expect(body.regions).toEqual(expect.arrayContaining(['高雄', '屏東', '台南']));
    expect(body.certifications).toEqual(expect.arrayContaining(['導遊證', '急救證照']));
    expect(body.payment_methods).toEqual(expect.arrayContaining(['bank', 'linepay']));
  });
});

import { test, expect, fillFormHydrated } from './helpers';
import type { Route } from '@playwright/test';

/**
 * 嚮導申請表單 → API → 持久化 round-trip（申請/查詢真打後端）。
 *
 * 鎖定：表單收集的專長／語言／熟悉區域／收款方式必須真的存進
 * guide_applications（先前後端把這些欄位整批丟掉）；海報新增的補充欄位
 * （推薦祕境／帶團經驗／方便聯絡時間…）組進 bio 一起落地，管理者後台看得到。
 *
 * 單頁流程改版：原三步驟合併為一頁，照片全部選填（不再 gating 送出）。
 * 上傳 API 走 Supabase Storage，無 in-memory fallback，故僅 mock
 * /api/guide-applications/upload；其餘不 mock。
 */

test.describe.configure({ timeout: 90_000 });

const EMAIL = `e2e-apply-${Date.now()}@example.com`;
const AVATAR_URL = 'https://cdn.example.com/guides/applications/e2e/avatar-1.png';
const GALLERY_URL = 'https://cdn.example.com/guides/applications/e2e/gallery-1.png';

// 1x1 PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('單頁填寫申請（含照片上傳／專長／語言／區域）→ 送出 → API 可查回完整資料', async ({ page, request }) => {
  let uploadCount = 0;
  await page.route('**/api/guide-applications/upload', async (route: Route) => {
    const kind = /name="kind"\r\n\r\n(\w+)/.exec(route.request().postData() || '')?.[1] || 'avatar';
    uploadCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { url: kind === 'gallery' ? GALLERY_URL : AVATAR_URL, kind } }),
    });
  });

  await page.goto('/guide/apply');

  // 海報文案：招募標頭與圓章金句。
  await expect(page.getByRole('heading', { name: '在地嚮導招募中！' })).toBeVisible();
  await expect(page.getByText('你的在地故事，就是旅人的祕境指南。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '加入祕島，你可以' })).toBeVisible();

  // 送出鈕在必填未完成前 disabled（照片不參與 gating）。
  const submitBtn = page.getByRole('button', { name: /送出申請/ });
  await expect(submitBtn, '必填未填完前不得送出').toBeDisabled();

  // 必填五欄（fillFormHydrated：避免 hydration 前的輸入被 React 抹掉）
  await fillFormHydrated(page, [
    ['#apply-fullname', '端對端測試嚮導'],
    ['#apply-phone', '0911-222-333'],
    ['#apply-email', EMAIL],
    ['#apply-city', '高雄市'],
    ['#apply-bio', '十年柴山生態導覽經驗，熟悉在地文史。'],
  ]);

  // 必填齊了就能送出——照片還沒上傳也一樣。
  await expect(submitBtn, '照片為選填，不得 gating 送出').toBeEnabled();

  // 選填：專長（平台四大分類）／語言／區域／海報補充欄位
  await page.getByLabel('山徑').check();
  await page.getByLabel('文化').check();
  await page.getByLabel('英文').check();
  await page.getByLabel('中文').check();
  await page.getByLabel('高雄').check();
  await page.locator('#apply-spot').fill('柴山裡少有人知的石灰岩洞');
  await page.getByRole('radio', { name: '有', exact: true }).check();
  await page.locator('#apply-other-trip').fill('美食、攝影');
  await page.locator('#apply-contact-time').fill('平日晚上 7 點後');
  await page.locator('#apply-line').fill('chaishan-a-xian');

  // 照片：同頁真上傳（選填）
  await page.locator('#apply-photo-avatar').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(page.getByTestId('apply-avatar-preview')).toBeVisible();
  await page.locator('#apply-photo-gallery').setInputFiles({ name: 'tour.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(page.getByTestId('apply-gallery-preview')).toBeVisible();
  expect(uploadCount).toBeGreaterThanOrEqual(2);

  await submitBtn.click();

  // 成功畫面
  await expect(page.getByText(/申請已送出/)).toBeVisible({ timeout: 15_000 });

  // API round-trip：列表查回該筆，欄位已持久化
  const res = await request.get('/api/guide-applications');
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const row = (json?.data || []).find((r: { email: string }) => r.email === EMAIL);
  expect(row, '送出的申請必須查得回來').toBeTruthy();
  expect(row.specialties).toEqual(expect.arrayContaining(['山徑', '文化']));
  expect(row.languages).toEqual(expect.arrayContaining(['中文', '英文']));
  // 熟悉區域一律存全名（chip 顯示短名「高雄」、送出 dbValue「高雄市」）。
  expect(row.regions).toEqual(expect.arrayContaining(['高雄市']));
  expect(row.profilePhotoUrl).toBe(AVATAR_URL);
  expect(row.galleryUrls).toEqual([GALLERY_URL]);
  // 海報補充欄位組進 bio，管理者後台讀 bio 即可看到。
  expect(row.bio).toContain('推薦祕境／特色體驗：柴山裡少有人知的石灰岩洞');
  expect(row.bio).toContain('帶團或導覽經驗：有');
  expect(row.bio).toContain('其他想帶的旅程類型：美食、攝影');
  expect(row.bio).toContain('LINE ID：chaishan-a-xian');
  expect(row.bio).toContain('方便聯絡時間：平日晚上 7 點後');
});

test('只填必填四欄即可送出（照片與補充說明全選填）', async ({ page, request }) => {
  const email = `e2e-apply-nophoto-${Date.now()}@example.com`;
  await page.goto('/guide/apply');

  // 只填姓名／電話／Email／居住縣市 —— 補充說明與照片都不填。
  await fillFormHydrated(page, [
    ['#apply-fullname', '無照片測試嚮導'],
    ['#apply-phone', '0933-444-555'],
    ['#apply-email', email],
    ['#apply-city', '花蓮縣'],
  ]);

  const submitBtn = page.getByRole('button', { name: /送出申請/ });
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();
  await expect(page.getByText(/申請已送出/)).toBeVisible({ timeout: 15_000 });

  const res = await request.get('/api/guide-applications');
  const json = await res.json();
  const row = (json?.data || []).find((r: { email: string }) => r.email === email);
  expect(row, '無照片申請也必須查得回來').toBeTruthy();
  expect(row.profilePhotoUrl ?? null).toBeNull();
  expect(row.galleryUrls).toEqual([]);
  // 補充說明留空 → bio 走佔位文案（後端硬要求 bio 非空，不得讓申請卡在 400）。
  expect(row.bio).toBe('（申請者未填寫補充說明，請於聯繫時確認）');
});

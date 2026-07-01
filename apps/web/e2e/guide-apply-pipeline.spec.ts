import { test, expect } from '@playwright/test';
import type { Route } from '@playwright/test';

/**
 * 導遊申請表單 → API → 持久化 round-trip（申請/查詢真打後端）。
 *
 * 鎖定：表單收集的專長/語言/熟悉區域/證照/收款方式必須真的存進
 * guide_applications（先前後端把這些欄位整批丟掉）；第 2 步照片為
 * 真上傳（個人照片必填 gating），URL 隨申請持久化。
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

test('填寫申請（含照片上傳/專長/語言/區域/證照）→ 送出 → API 可查回完整資料', async ({ page, request }) => {
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

  // Step 1：基本資料 + 專長等複選
  await page.locator('#apply-fullname').fill('端對端測試導遊');
  await page.locator('#apply-phone').fill('0911-222-333');
  await page.locator('#apply-email').fill(EMAIL);
  await page.locator('#apply-city').fill('高雄市');
  await page.locator('#apply-bio').fill('十年柴山生態導覽經驗，熟悉在地文史。');
  // 專長領域已同步為平台四大分類（山徑／野溪／文化／生態）。
  await page.getByLabel('山徑').check();
  await page.getByLabel('文化').check();
  await page.getByLabel('英文').check();
  await page.getByLabel('中文').check();
  await page.getByLabel('高雄').check();
  await page.getByLabel('急救證照').check();
  await page.getByRole('button', { name: /下一步：證件與照片/ }).click();

  // Step 2：證件誠實說明 + 照片真上傳
  await expect(page.getByText('請勿在表單中提供證件影本')).toBeVisible();
  const nextBtn = page.getByRole('button', { name: /下一步：審核送出/ });
  await expect(nextBtn, '個人照片未上傳前不得進入下一步').toBeDisabled();

  await page.locator('#apply-photo-avatar').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(page.getByTestId('apply-avatar-preview')).toBeVisible();
  await page.locator('#apply-photo-gallery').setInputFiles({ name: 'tour.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(page.getByTestId('apply-gallery-preview')).toBeVisible();
  expect(uploadCount).toBeGreaterThanOrEqual(2);
  await expect(nextBtn).toBeEnabled();
  await nextBtn.click();

  // Step 3：摘要顯示專長與照片 → 送出
  await expect(page.getByText(/專長：.*山徑/)).toBeVisible();
  await expect(page.getByText(/活動照片：1 張/)).toBeVisible();
  await page.getByRole('button', { name: /送出申請|確認送出/ }).click();

  // Step 4：成功
  await expect(page.getByText(/申請已送出|感謝/)).toBeVisible({ timeout: 15_000 });

  // API round-trip：列表查回該筆，新欄位已持久化
  const res = await request.get('/api/guide-applications');
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const row = (json?.data || []).find((r: { email: string }) => r.email === EMAIL);
  expect(row, '送出的申請必須查得回來').toBeTruthy();
  expect(row.specialties).toEqual(expect.arrayContaining(['山徑', '文化']));
  expect(row.languages).toEqual(expect.arrayContaining(['中文', '英文']));
  expect(row.regions).toEqual(expect.arrayContaining(['高雄']));
  expect(row.certifications).toEqual(expect.arrayContaining(['急救證照']));
  expect(row.profilePhotoUrl).toBe(AVATAR_URL);
  expect(row.galleryUrls).toEqual([GALLERY_URL]);
});

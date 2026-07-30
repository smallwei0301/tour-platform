import { test, expect, fillFormHydrated } from './helpers';

/**
 * 申請表單照片上傳：上傳前必須在瀏覽器壓成 WebP 小檔。
 *
 * 根因（線上實測）：手機原圖常 3–12MB，直接 POST 到
 * /api/guide-applications/upload 會撞到 Vercel function 約 4.5MB 的 request
 * body 上限（FUNCTION_PAYLOAD_TOO_LARGE，HTTP 413），請求進不到 route，
 * 前端只看到通用「照片上傳失敗，請稍後再試」。
 *
 * 修法：申請表單沿用嚮導後台既有的 client 壓縮（compressImage → WebP），
 * 上傳檔遠小於上限。本測試攔截 upload API，驗證送出的檔案已是 WebP 且很小。
 */

// 1x1 透明 PNG（瀏覽器可解碼 → compressImage 會重繪成 400x400 WebP）。
const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMEAYHKb8YqAAAAAElFTkSuQmCC',
  'base64',
);

test('申請表單個人照：上傳前壓成 WebP 小檔（避開 Vercel 4.5MB 限制）', async ({ page }) => {
  let uploadedBody = '';
  let uploadedBytes = 0;
  await page.route('**/api/guide-applications/upload', async (route) => {
    const buf = route.request().postDataBuffer();
    uploadedBytes = buf ? buf.length : 0;
    uploadedBody = buf ? buf.toString('latin1') : '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { url: 'https://example.com/avatar.webp', path: 'p', kind: 'avatar' } }),
    });
  });

  await page.goto('/guide/apply');
  // 單頁流程：照片欄位與基本資料同頁，無須先過步驟。
  // 先填必填欄位並等送出鈕轉為 enabled ＝ hydration 完成、React 已接上
  // onChange；否則 setInputFiles 可能早於 handler 掛載而完全不觸發上傳。
  await fillFormHydrated(page, [
    ['#apply-fullname', '壓縮測試嚮導'],
    ['#apply-phone', '0912-345-678'],
    ['#apply-email', 'compress@example.com'],
    ['#apply-city', '高雄市'],
    ['#apply-bio', '柴山生態導覽。'],
  ]);
  await expect(page.getByRole('button', { name: /送出申請/ })).toBeEnabled();

  // 上傳「個人照」（原始為 PNG）。
  await page.locator('#apply-photo-avatar').setInputFiles({
    name: 'origin.png',
    mimeType: 'image/png',
    buffer: ONE_BY_ONE_PNG,
  });

  // 預覽出現＝壓縮 + 上傳流程成功。
  await expect(page.getByTestId('apply-avatar-preview')).toBeVisible();

  // 送出的 multipart 應已是 WebP（非原始 PNG），且整體遠小於 4.5MB 上限。
  expect(uploadedBody).toContain('image/webp');
  expect(uploadedBody).toContain('avatar.webp');
  expect(uploadedBytes).toBeGreaterThan(0);
  expect(uploadedBytes).toBeLessThan(4.5 * 1024 * 1024);
});

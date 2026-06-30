import { test, expect, setGuideSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * 導遊後台個人設定：上傳大頭照時可自選裁切範圍與大小。
 *
 * 鎖定：
 *   - 選檔後彈出裁切對話框（拖曳 + 縮放滑桿），而非直接上傳。
 *   - 按「套用並上傳」才送出 POST，並把回傳 url 套用為頭像。
 *   - 取消則不送任何上傳請求。
 * 後端以 page.route 模擬（不依賴 Supabase）。
 */

test.describe.configure({ timeout: 90_000 });

const GUIDE_ID = 'd1111111-1111-4111-8111-111111111111';

// 1x1 透明 PNG（足以讓 window.Image 載入 + canvas 裁切）。
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function profilePayload() {
  return {
    ok: true,
    data: {
      display_name: '柴山小芳', headline: '在地十年嚮導', bio: '熟悉柴山步道生態。',
      region: '高雄', regions: ['高雄'], languages: ['中文'], specialties: ['生態導覽'],
      profile_photo_url: null, hero_image_url: null, gallery_urls: [],
      slug: 'guide-chaishan-fang', is_published: false,
    },
  };
}

async function mockBase(page: import('@playwright/test').Page) {
  await page.route('**/api/guide/profile', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profilePayload()) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { updated: true } }) });
    }
  });
  await page.route('**/api/guide/auth/csrf', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { csrfToken: 't' } }) }),
  );
}

test('選檔後彈出裁切對話框，套用才上傳並套用回傳頭像', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await mockBase(page);

  let uploadCount = 0;
  // 回傳允許網域（*.supabase.co）的 URL，讓 next/image 預覽可渲染。
  const avatarUrl = 'https://demo.supabase.co/storage/v1/object/public/avatars/cropped.webp';
  await page.route('**/api/guide/profile/upload-avatar', async (route: Route) => {
    uploadCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { url: avatarUrl } }),
    });
  });
  // next/image optimizer 會去抓原圖；攔截回傳一張 PNG，避免外連失敗。
  await page.route('**/_next/image**', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 });
  });

  await page.goto('/guide/profile');
  await expect(page.getByText('頭像（正方形，建議 400×400）')).toBeVisible({ timeout: 20_000 });

  // 選檔：直接設定隱藏的 file input。
  await page.getByTestId('avatar-file-input').setInputFiles({
    name: 'me.png', mimeType: 'image/png', buffer: PNG_1X1,
  });

  // 應彈出裁切對話框，而非立刻上傳。
  await expect(page.getByTestId('image-crop-modal')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('image-crop-zoom')).toBeVisible();
  expect(uploadCount).toBe(0);

  // 調整縮放滑桿（驗證可互動），再套用。
  await page.getByTestId('image-crop-zoom').fill('2');
  await page.getByTestId('image-crop-confirm').click();

  // 應送出一次上傳，且對話框關閉、頭像更新。
  await expect.poll(() => uploadCount).toBe(1);
  await expect(page.getByTestId('image-crop-modal')).toHaveCount(0);
  await expect(page.getByAltText('頭像預覽')).toBeVisible({ timeout: 10_000 });
});

test('取消裁切不送出任何上傳請求', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await mockBase(page);

  let uploadCount = 0;
  await page.route('**/api/guide/profile/upload-avatar', async (route: Route) => {
    uploadCount += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { url: 'x' } }) });
  });

  await page.goto('/guide/profile');
  await expect(page.getByText('頭像（正方形，建議 400×400）')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('avatar-file-input').setInputFiles({
    name: 'me.png', mimeType: 'image/png', buffer: PNG_1X1,
  });

  await expect(page.getByTestId('image-crop-modal')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '取消' }).click();

  await expect(page.getByTestId('image-crop-modal')).toHaveCount(0);
  expect(uploadCount).toBe(0);
});

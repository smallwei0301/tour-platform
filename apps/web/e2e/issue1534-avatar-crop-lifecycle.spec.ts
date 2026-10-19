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

// Synthetic-only deferred encoder: uploads are intercepted, no real account/storage.
declare global {
  interface Window {
    issue1534Encodes: Array<(done: () => void) => void>;
    issue1534EncodeCount: number;
    issue1534UploadFetchCount: number;
  }
}

async function openDeferredCrop(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    // Count synchronously before fetch dispatch reaches Playwright's Node route.
    // Therefore a stale callback cannot pass a zero-upload assertion just because
    // route delivery is still pending when the encoder-completion barrier settles.
    const nativeFetch = window.fetch.bind(window);
    window.issue1534UploadFetchCount = 0;
    window.fetch = (input, init) => {
      const target = input instanceof Request ? input.url : String(input);
      if (new URL(target, window.location.href).pathname === '/api/guide/profile/upload-avatar') {
        window.issue1534UploadFetchCount += 1;
      }
      return nativeFetch(input, init);
    };
    const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    window.issue1534Encodes = [];
    window.issue1534EncodeCount = 0;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      window.issue1534EncodeCount += 1;
      window.issue1534Encodes.push(done => nativeToBlob.call(this, blob => { callback(blob); done(); }, type, quality));
    };
  });
  await setGuideSession(page, GUIDE_ID);
  await mockBase(page);
  let uploads = 0;
  await page.route('**/api/guide/profile/upload-avatar', async route => {
    uploads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { url: 'https://demo.supabase.co/storage/v1/object/public/avatars/mock.webp' } }) });
  });
  await page.route('**/_next/image**', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 }));
  await page.goto('/guide/profile');
  await selectImage(page, 'first.png');
  return () => uploads;
}

async function selectImage(page: import('@playwright/test').Page, name: string) {
  await page.getByTestId('avatar-file-input').setInputFiles({ name, mimeType: 'image/png', buffer: PNG_1X1 });
  await expect(page.getByTestId('image-crop-confirm')).toBeEnabled();
}

async function flushEncoder(page: import('@playwright/test').Page) {
  // Resolve only when the browser's real encoding callback has run, avoiding sleeps.
  await page.evaluate(() => new Promise<void>(resolve => {
    const next = window.issue1534Encodes.shift();
    if (!next) throw new Error('No queued encoder');
    next(resolve);
  }));
}

for (const dismissal of ['button', 'escape', 'backdrop'] as const) {
  test(`deferred encoding after ${dismissal} cancellation never uploads`, async ({ page }) => {
    const uploads = await openDeferredCrop(page);
    await page.getByTestId('image-crop-confirm').click();
    await expect.poll(() => page.evaluate(() => window.issue1534EncodeCount)).toBe(1);
    if (dismissal === 'button') await page.getByRole('button', { name: '取消', exact: true }).click();
    else if (dismissal === 'escape') await page.keyboard.press('Escape');
    else await page.getByTestId('image-crop-modal').click({ position: { x: 2, y: 2 } });
    await expect(page.getByTestId('image-crop-modal')).toHaveCount(0);
    await flushEncoder(page);
    expect(await page.evaluate(() => window.issue1534UploadFetchCount)).toBe(0);
    expect(uploads()).toBe(0);
  });
}

test('repeated confirmation has one encode and one mocked upload', async ({ page }) => {
  const uploads = await openDeferredCrop(page);
  await page.getByTestId('image-crop-confirm').dblclick();
  expect(await page.evaluate(() => window.issue1534EncodeCount)).toBe(1);
  expect(await page.evaluate(() => window.issue1534UploadFetchCount)).toBe(0);
  expect(uploads()).toBe(0);
  await flushEncoder(page);
  expect(await page.evaluate(() => window.issue1534UploadFetchCount)).toBe(1);
  await expect.poll(uploads).toBe(1);
  await expect(page.getByTestId('image-crop-modal')).toHaveCount(0);
});

test('replacement invalidates old encoding and only new file can upload', async ({ page }) => {
  const uploads = await openDeferredCrop(page);
  await page.getByTestId('image-crop-confirm').click();
  await selectImage(page, 'replacement.png');
  await flushEncoder(page);
  expect(await page.evaluate(() => window.issue1534UploadFetchCount)).toBe(0);
  expect(uploads()).toBe(0);
  await expect(page.getByTestId('image-crop-modal')).toBeVisible();
  await page.getByTestId('image-crop-confirm').click();
  await flushEncoder(page);
  expect(await page.evaluate(() => window.issue1534UploadFetchCount)).toBe(1);
  await expect.poll(uploads).toBe(1);
});

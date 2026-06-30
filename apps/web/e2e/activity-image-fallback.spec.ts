import { test, expect } from '@playwright/test';

// 後台已上傳/儲存的活動照片在前台顯示「無法載入」(#admin-photo)：
// 成因是 next/image 影像優化器（/_next/image）回非 2xx（Vercel 優化額度用罄、
// 大尺寸變體逾時、來源格式無法優化等），onError 直接落到「無法載入」佔位。
// 修正：FallbackImage 在優化器失敗時退回 unoptimized 直接載入原圖，照片仍能顯示；
// 只有連原圖都載不到才顯示「無法載入」。
//
// 本 spec 模擬「優化器全掛、原圖正常」，驗證：
//   (a) 輪播不再出現「無法載入」佔位；
//   (b) 圖片 src 退回原始來源（非 /_next/image）—— 即優化失敗的復原路徑確有執行；
//   (c) 原圖來源確實回 200（顯示的 src 背後有真實影像位元組）。

const ACTIVITY_PATH = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';

// 1x1 透明 PNG（合法影像）
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

test('優化器失敗時退回原圖、不顯示「無法載入」', async ({ page }) => {
  const rawResponses: number[] = [];

  // 影像優化器全部回 500 —— 模擬 Vercel 優化額度用罄／逾時。
  await page.route('**/_next/image**', (route) => route.fulfill({ status: 500, body: 'optimizer down' }));

  // 原始圖片來源（Unsplash，與 supabase storage 同屬已優化外部來源）正常回圖。
  await page.route('https://images.unsplash.com/**', (route) => {
    rawResponses.push(200);
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 });
  });

  await page.goto(ACTIVITY_PATH, { waitUntil: 'domcontentloaded' });

  const carousel = page.locator('.kkd-carousel-wrap');
  await expect(carousel).toBeVisible();

  // 等待 client hydration + onError → 退回 unoptimized 的重繪。
  // 等到至少一張輪播圖的 src 退回原始來源（不再是 /_next/image）。
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('.kkd-carousel-wrap img')) as HTMLImageElement[];
          return imgs.some((img) => /images\.unsplash\.com/.test(img.src) && !/\/_next\/image/.test(img.src));
        }),
      { timeout: 10_000 },
    )
    .toBeTruthy();

  // (a) 輪播不得顯示「無法載入」佔位（代表退回後成功顯示，而非落到壞圖文案）。
  await expect(carousel.getByText('無法載入')).toHaveCount(0);

  // (c) 原圖來源確實被請求且回 200（退回路徑真的去載了原圖）。
  expect(rawResponses.length).toBeGreaterThan(0);
});

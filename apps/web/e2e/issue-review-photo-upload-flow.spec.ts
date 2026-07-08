import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * 旅客評價照片上傳 UX（真實瀏覽器，backend 以 page.route mock）。
 *
 * 驗證：選檔 → 上傳 → 預覽縮圖出現（橫向卷軸） → 送出時 payload 帶 photoUrls。
 * 不依賴 Supabase：upload-photo 與 reviews 兩個 endpoint 皆 mock。
 */

const ORDER_ID = '13790000-aaaa-4bbb-8ccc-000000000099';
const FAKE_PHOTO_URL =
  'https://example.supabase.co/storage/v1/object/public/review-photos/u1/123-abc.jpg';

function orderBody(status: string) {
  return {
    ok: true,
    data: {
      id: ORDER_ID,
      status,
      totalTwd: 4000,
      peopleCount: 2,
      contactName: '測試旅客',
      contactEmail: 'traveler-photo@example.com',
      title: '高雄柴山探洞體驗',
      scheduleStartAt: '2026-05-01T09:00:00+08:00',
      createdAt: '2026-04-01T00:00:00Z',
    },
  };
}

test.describe('旅客評價照片上傳流程', () => {
  test('選檔 → 預覽縮圖 → 送出 payload 帶 photoUrls', async ({ page }) => {
    await setTravelerSession(page);
    await page.route(`**/api/v2/orders/${ORDER_ID}**`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orderBody('completed')) });
    });

    // 照片上傳 endpoint：回傳假的 review-photos public URL
    await page.route('**/api/reviews/upload-photo', async (route: Route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { url: FAKE_PHOTO_URL, path: 'u1/123-abc.jpg' } }),
      });
    });

    let submittedPayload: Record<string, unknown> | null = null;
    await page.route('**/api/reviews', async (route: Route) => {
      submittedPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { id: 'rev-photo-1', status: 'pending' } }),
      });
    });

    await page.goto(`/me/orders/${ORDER_ID}?review=1`);

    const textarea = page.locator('#order-review-text');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // 選一張假圖（hidden file input，用 setInputFiles 觸發 onChange）
    const strip = page.locator('[data-testid="review-photo-strip"]');
    await expect(strip).toBeVisible();
    await strip.locator('input[type="file"]').setInputFiles({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });

    // 上傳成功後出現預覽縮圖
    await expect(strip.locator('img')).toHaveCount(1, { timeout: 10_000 });
    // 容器為橫向卷軸（手機可左右滑動）
    const overflowX = await strip.evaluate((el) => getComputedStyle(el).overflowX);
    expect(['auto', 'scroll']).toContain(overflowX);

    await page.locator('button[aria-label="rating 5"]').click();
    await textarea.fill('照片實測：洞穴超美！');
    await page.getByRole('button', { name: '提交評價' }).click();

    await expect(page.getByText('評價已送出，等候審核')).toBeVisible();
    expect(submittedPayload).not.toBeNull();
    expect(submittedPayload!.photoUrls).toEqual([FAKE_PHOTO_URL]);
  });
});

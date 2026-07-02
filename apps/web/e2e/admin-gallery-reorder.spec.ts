import { test, expect } from './helpers';

/**
 * 管理者後台行程編輯 — 活動照片排序 UI。
 *
 * 涵蓋 GalleryReorder 元件的按鈕排序（←／→）與移除，以及主圖標記。
 * 拖曳（native HTML5 DnD）在 Playwright 下不穩定，改由 ←／→ 按鈕驗證排序邏輯；
 * 純排序函式另有 tests/unit/gallery-order.test.mjs 覆蓋。
 *
 * 後端一律以 page.route mock，不依賴 Supabase seed。
 */

const ACTIVITY_ID = 'e2e-gallery';
const PHOTO_A = 'https://images.unsplash.com/photo-aaa?e2e=a';
const PHOTO_B = 'https://images.unsplash.com/photo-bbb?e2e=b';
const PHOTO_C = 'https://images.unsplash.com/photo-ccc?e2e=c';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

function activityPayload() {
  return {
    ok: true,
    data: {
      id: ACTIVITY_ID,
      slug: ACTIVITY_ID,
      title: 'E2E 相簿排序測試',
      status: 'draft',
      priceTwd: 1000,
      coverImageUrl: '',
      imageUrls: [PHOTO_A, PHOTO_B, PHOTO_C],
    },
  };
}

test.describe('管理者後台 — 活動照片排序 UI', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    // next/image 最佳化端點：回傳 1x1 png，避免實際外連。
    await page.route('**/_next/image**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PX_PNG })
    );
    // 排程／方案端點：回空，讓頁面能渲染。
    await page.route('**/api/v2/admin/activities/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) })
    );
    await page.route('**/api/admin/activities/*/schedules**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) })
    );
    // 主載入端點：回傳含三張照片的活動。
    await page.route(`**/api/admin/activities/${ACTIVITY_ID}`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(activityPayload()) })
    );
  });

  async function srcAt(page: import('@playwright/test').Page, index: number): Promise<string> {
    return (await page.getByTestId(`gallery-item-${index}`).locator('img').getAttribute('src')) || '';
  }

  test('渲染三張照片，第一張標記為主圖', async ({ authedPage: page }) => {
    await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
    const grid = page.getByTestId('gallery-reorder');
    await expect(grid).toBeVisible();
    await expect(page.getByTestId('gallery-item-0')).toBeVisible();
    await expect(page.getByTestId('gallery-item-1')).toBeVisible();
    await expect(page.getByTestId('gallery-item-2')).toBeVisible();
    // 主圖徽章在第一張。
    await expect(page.getByTestId('gallery-item-0').getByText('主圖')).toBeVisible();
    // src 順序對應 A, B, C（透過 /_next/image?url= 內含 encode 後的原始 URL）。
    expect(await srcAt(page, 0)).toContain(encodeURIComponent(PHOTO_A));
    expect(await srcAt(page, 1)).toContain(encodeURIComponent(PHOTO_B));
  });

  test('點「往後移」把第一張移到第二位', async ({ authedPage: page }) => {
    await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
    await expect(page.getByTestId('gallery-item-0')).toBeVisible();

    await page.getByTestId('gallery-item-0').getByRole('button', { name: '把第 1 張往後移' }).click();

    // A 現在在第二位、B 升到主圖位。
    expect(await srcAt(page, 0)).toContain(encodeURIComponent(PHOTO_B));
    expect(await srcAt(page, 1)).toContain(encodeURIComponent(PHOTO_A));
    await expect(page.getByTestId('gallery-item-0').getByText('主圖')).toBeVisible();
  });

  test('第一張的「往前移」被停用、最後一張的「往後移」被停用', async ({ authedPage: page }) => {
    await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
    await expect(page.getByTestId('gallery-item-0')).toBeVisible();

    await expect(
      page.getByTestId('gallery-item-0').getByRole('button', { name: '把第 1 張往前移' })
    ).toBeDisabled();
    await expect(
      page.getByTestId('gallery-item-2').getByRole('button', { name: '把第 3 張往後移' })
    ).toBeDisabled();
  });

  test('點移除把照片數量從 3 減為 2', async ({ authedPage: page }) => {
    await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
    await expect(page.getByTestId('gallery-item-2')).toBeVisible();

    await page.getByTestId('gallery-item-1').getByRole('button', { name: '移除第 2 張' }).click();

    await expect(page.getByTestId('gallery-item-2')).toHaveCount(0);
    await expect(page.getByTestId('gallery-item-0')).toBeVisible();
    await expect(page.getByTestId('gallery-item-1')).toBeVisible();
    // B 被移除，剩 A、C。
    expect(await srcAt(page, 0)).toContain(encodeURIComponent(PHOTO_A));
    expect(await srcAt(page, 1)).toContain(encodeURIComponent(PHOTO_C));
  });
});

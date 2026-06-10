import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Admin 導遊詳情雙實體 resolver — 點「導遊申請」卡片名字不再 404。
 *
 * 根因：申請卡連結帶 guide_applications.id，但詳情 API 只查
 * guide_profiles（兩個 id 空間）→ 任何申請點名字都「找不到導遊資料」。
 * 修法：API 依序解析 profile → application，前端依 kind 渲染對應視圖。
 */

test.describe.configure({ timeout: 90_000 });

const APPLICATION_ID = 'a9999999-1111-4111-8111-111111111111';
const PROFILE_ID = 'b9999999-2222-4222-8222-222222222222';

const APPLICATION_DETAIL = {
  ok: true,
  data: {
    kind: 'application',
    id: APPLICATION_ID,
    display_name: '林小芳',
    application: {
      fullName: '林小芳',
      phone: '0912-345-678',
      email: 'fang@example.com',
      city: '高雄市',
      bio: '熟悉柴山步道與生態導覽。',
      specialties: ['山林健行', '文化走讀'],
      languages: ['中文', '英文'],
      regions: ['高雄', '屏東'],
      certifications: ['急救證照'],
      paymentMethod: 'bank',
      status: 'pending',
      adminNote: null,
      createdAt: '2026-06-09T08:00:00Z',
    },
  },
};

const PROFILE_DETAIL = {
  ok: true,
  data: {
    kind: 'profile',
    id: PROFILE_ID,
    display_name: '王大明',
    slug: 'wang-da-ming',
    verification_status: 'approved',
    headline: '在地十年嚮導',
    region: '高雄',
    rating_avg: 4.8,
    guide_email: 'wang@example.com',
    profile_photo_url: null,
    bio: '專注山海行程。',
    specialty: '登山',
    created_at: '2026-05-01T08:00:00Z',
  },
};

test('點申請者名字 → 詳情頁渲染「申請詳情」視圖（不再 404）', async ({ authedPage: page }) => {
  await page.route(`**/api/admin/guides/${APPLICATION_ID}`, (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(APPLICATION_DETAIL) }),
  );
  await page.route('**/api/admin/guide-applications**', (r: Route) =>
    r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [{ id: APPLICATION_ID, fullName: '林小芳', phone: '0912-345-678', email: 'fang@example.com', city: '高雄市', bio: '熟悉柴山步道與生態導覽。', status: 'pending', createdAt: '2026-06-09T08:00:00Z' }] }),
    }),
  );

  // 從導遊管理列表（申請 tab）點名字 → 導頁
  await page.goto('/admin/guides');
  await page.getByRole('link', { name: '林小芳' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/guides/${APPLICATION_ID}`));

  const card = page.getByTestId('admin-guide-application-detail');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText('林小芳')).toBeVisible();
  await expect(card.getByText('待審核')).toBeVisible();
  await expect(card.getByText('尚未建立正式導遊檔案')).toBeVisible();
  await expect(card.getByText('fang@example.com')).toBeVisible();
  // 申請人自填的專長/語言/地區/證照必須呈現給審核者
  await expect(card.getByText('山林健行')).toBeVisible();
  await expect(card.getByText('英文')).toBeVisible();
  await expect(card.getByText('屏東')).toBeVisible();
  await expect(card.getByText('急救證照')).toBeVisible();
  // 不得出現舊錯誤
  await expect(page.getByText('找不到導遊資料')).toHaveCount(0);
});

test('正式導遊檔案視圖不回歸', async ({ authedPage: page }) => {
  await page.route(`**/api/admin/guides/${PROFILE_ID}`, (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROFILE_DETAIL) }),
  );

  await page.goto(`/admin/guides/${PROFILE_ID}`);
  await expect(page.getByRole('heading', { name: '王大明' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('@wang-da-ming')).toBeVisible();
  await expect(page.getByText('已審核')).toBeVisible();
  await expect(page.getByTestId('admin-guide-application-detail')).toHaveCount(0);
});

test('雙來源都查不到 → 顯示精準 404 訊息', async ({ authedPage: page }) => {
  await page.route('**/api/admin/guides/c9999999-3333-4333-8333-333333333333', (r: Route) =>
    r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: '找不到導遊資料：此 ID 不屬於任何導遊檔案或導遊申請' } }) }),
  );

  await page.goto('/admin/guides/c9999999-3333-4333-8333-333333333333');
  await expect(page.getByText('找不到導遊資料：此 ID 不屬於任何導遊檔案或導遊申請')).toBeVisible({ timeout: 20_000 });
});

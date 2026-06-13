import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Admin 首頁精選設定（/admin/homepage）
 * - 載入目前設定與可選行程
 * - 選溯溪當編輯精選＋勾選更多精選 → 儲存時送出正確 payload
 *   （與編輯精選衝突的勾選由前端防呆排除）
 * Backend 以 page.route mock，不依賴 Supabase seed。
 */

test.describe.configure({ timeout: 90_000 });

const CHOICES = [
  { slug: 'kaohsiung-chaishan-cave-experience', title: '高雄柴山探洞體驗｜跟著 Andy Lee 走進城市邊緣的地形秘境', region: '高雄市', price: 2000, durationDisplay: '3-4 小時' },
  { slug: 'dadadaocheng-walk', title: '大稻埕百年老街深度漫步', region: '台北市', price: 1500, durationDisplay: '3 小時' },
  { slug: 'taipei-night-market-food-tour', title: '台北夜市美食文化探索', region: '台北市', price: 1200, durationDisplay: '4 小時' },
  { slug: 'hualien-river-trekking', title: '花蓮秀姑巒溪溯溪全日冒險', region: '花蓮縣', price: 3200, durationDisplay: '全天（約 8 小時）' },
];

const GET_PAYLOAD = {
  ok: true,
  data: {
    settings: { editorPickSlug: null, moreFeaturedSlugs: [], updatedAt: null, updatedBy: null },
    choices: CHOICES,
    defaults: { editorPickSlug: 'kaohsiung-chaishan-cave-experience', moreFeaturedLimit: 4 },
  },
};

test('載入設定頁 → 選溯溪為編輯精選並儲存（衝突勾選自動排除）', async ({ authedPage: page }) => {
  let putBody: { editorPickSlug?: string | null; moreFeaturedSlugs?: string[] } | null = null;

  await page.route('**/api/admin/homepage-featured', (r: Route) => {
    if (r.request().method() === 'PUT') {
      putBody = r.request().postDataJSON();
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            settings: {
              editorPickSlug: putBody?.editorPickSlug ?? null,
              moreFeaturedSlugs: putBody?.moreFeaturedSlugs ?? [],
              updatedAt: '2026-06-12T03:00:00Z',
              updatedBy: 'admin@test.dev',
            },
          },
        }),
      });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GET_PAYLOAD) });
  });

  await page.goto('/admin/homepage');

  // 可選行程載入
  await expect(page.getByTestId('editor-pick-hualien-river-trekking')).toBeVisible();
  await expect(page.getByText('花蓮秀姑巒溪溯溪全日冒險').first()).toBeVisible();

  // 選溯溪當編輯精選
  await page.getByTestId('editor-pick-hualien-river-trekking').locator('input[type=radio]').check();

  // 更多精選勾柴山＋大稻埕，並嘗試勾選溯溪（應為 disabled — 衝突防呆）
  await page.getByTestId('more-featured-kaohsiung-chaishan-cave-experience').locator('input[type=checkbox]').check();
  await page.getByTestId('more-featured-dadadaocheng-walk').locator('input[type=checkbox]').check();
  await expect(
    page.getByTestId('more-featured-hualien-river-trekking').locator('input[type=checkbox]'),
  ).toBeDisabled();

  await page.getByTestId('homepage-featured-save').click();
  await expect(page.getByTestId('homepage-featured-saved')).toBeVisible();

  expect(putBody).not.toBeNull();
  expect(putBody!.editorPickSlug).toBe('hualien-river-trekking');
  expect(putBody!.moreFeaturedSlugs).toEqual([
    'kaohsiung-chaishan-cave-experience',
    'dadadaocheng-walk',
  ]);
});

test('儲存失敗（400 驗證錯誤）→ 顯示錯誤訊息', async ({ authedPage: page }) => {
  await page.route('**/api/admin/homepage-featured', (r: Route) => {
    if (r.request().method() === 'PUT') {
      return r.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { code: 'HOMEPAGE_FEATURED_INVALID', message: 'editorPickSlug 不存在：ghost' } }),
      });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GET_PAYLOAD) });
  });

  await page.goto('/admin/homepage');
  await page.getByTestId('editor-pick-hualien-river-trekking').locator('input[type=radio]').check();
  await page.getByTestId('homepage-featured-save').click();
  await expect(page.getByTestId('homepage-featured-save-error')).toContainText('不存在');
});

test('資料表未建立（503 HOMEPAGE_FEATURED_TABLE_MISSING）→ 顯示可執行的 migration 提示', async ({ authedPage: page }) => {
  // migration 未套用時：GET 仍能載入（後端 fail-open 回未設定狀態），
  // 儲存才以 503 + 可執行繁中訊息提示 operator 套用 migration。
  await page.route('**/api/admin/homepage-featured', (r: Route) => {
    if (r.request().method() === 'PUT') {
      return r.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: {
            code: 'HOMEPAGE_FEATURED_TABLE_MISSING',
            message:
              '首頁精選資料表尚未建立，請先把 migration「20260612090000_homepage_featured_settings.sql」套用到此環境的 Supabase（套用後重新載入 API schema）再試。在此之前首頁會顯示預設精選。',
          },
        }),
      });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GET_PAYLOAD) });
  });

  await page.goto('/admin/homepage');
  // GET fail-open：載入頁面正常，可選行程可見（不再是紅色 schema-cache 錯誤卡）
  await expect(page.getByTestId('editor-pick-hualien-river-trekking')).toBeVisible();
  await page.getByTestId('editor-pick-hualien-river-trekking').locator('input[type=radio]').check();
  await page.getByTestId('homepage-featured-save').click();
  await expect(page.getByTestId('homepage-featured-save-error')).toContainText('migration');
  await expect(page.getByTestId('homepage-featured-save-error')).toContainText('資料表尚未建立');
});

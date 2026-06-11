import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

/**
 * 導遊自主發佈：後台公開頁的「儲存並公開／取消公開」開關與首次引導。
 *
 * 鎖定：
 *   - 未公開時顯示「尚未公開」狀態與「儲存並公開」動作；按下後 PATCH
 *     帶 is_published=true，狀態轉為「公開中」。
 *   - 已公開時可「取消公開」（PATCH is_published=false）。
 *   - 首次登入（guide_is_new cookie）顯示引導說明。
 * 後端以 page.route 模擬（不依賴 Supabase）。
 */

test.describe.configure({ timeout: 90_000 });

const GUIDE_ID = 'd1111111-1111-4111-8111-111111111111';

function profilePayload(isPublished: boolean) {
  return {
    ok: true,
    data: {
      display_name: '柴山小芳', headline: '在地十年嚮導', bio: '熟悉柴山步道生態。',
      region: '高雄', languages: ['中文', '英文'], specialties: ['生態導覽'],
      profile_photo_url: null, hero_image_url: null, gallery_urls: [],
      slug: 'guide-chaishan-fang', is_published: isPublished,
    },
  };
}

test('未公開導遊：按「儲存並公開」送出 is_published=true 並轉為公開中', async ({ page }) => {
  await page.context().addCookies([
    { name: 'guide_token', value: `${GUIDE_ID}:1:${'a'.repeat(64)}`, url: 'http://127.0.0.1:3333' },
    { name: 'guide_id', value: GUIDE_ID, url: 'http://127.0.0.1:3333' },
    { name: 'guide_is_new', value: '1', url: 'http://127.0.0.1:3333' },
  ]);

  let patchedBody: Record<string, unknown> | null = null;
  await page.route('**/api/guide/profile', async (route: Route) => {
    if (route.request().method() === 'PATCH') {
      patchedBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { updated: true } }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profilePayload(false)) });
    }
  });
  await page.route('**/api/guide/auth/csrf', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { csrfToken: 't' } }) }),
  );

  await page.goto('/guide/profile');

  // 首次引導 + 未公開狀態
  await expect(page.getByTestId('guide-profile-onboarding')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('guide-publish-status')).toContainText('尚未公開');

  await page.getByRole('button', { name: '儲存並公開' }).click();

  await expect.poll(() => patchedBody && (patchedBody as Record<string, unknown>).is_published).toBe(true);
  await expect(page.getByTestId('guide-publish-status')).toContainText('公開中', { timeout: 10_000 });
});

test('已公開導遊：可「取消公開」送出 is_published=false', async ({ page }) => {
  await page.context().addCookies([
    { name: 'guide_token', value: `${GUIDE_ID}:1:${'a'.repeat(64)}`, url: 'http://127.0.0.1:3333' },
    { name: 'guide_id', value: GUIDE_ID, url: 'http://127.0.0.1:3333' },
  ]);

  let patchedBody: Record<string, unknown> | null = null;
  await page.route('**/api/guide/profile', async (route: Route) => {
    if (route.request().method() === 'PATCH') {
      patchedBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { updated: true } }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profilePayload(true)) });
    }
  });
  await page.route('**/api/guide/auth/csrf', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { csrfToken: 't' } }) }),
  );

  await page.goto('/guide/profile');
  await expect(page.getByTestId('guide-publish-status')).toContainText('公開中', { timeout: 20_000 });

  await page.getByRole('button', { name: '取消公開' }).click();
  await expect.poll(() => patchedBody && (patchedBody as Record<string, unknown>).is_published).toBe(false);
  await expect(page.getByTestId('guide-publish-status')).toContainText('尚未公開', { timeout: 10_000 });
});

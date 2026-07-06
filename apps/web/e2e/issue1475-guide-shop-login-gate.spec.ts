import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

// #1475 → 延後登入改版：匿名不再於進入 /shop/book 時被導去 /login，
// 可瀏覽 step 1–2（方案／日期／時段）；登入要求延後到「完成預約」前，
// 由 step 2 的「登入以完成預約」CTA 帶去 /login?next=...（狀態存 sessionStorage）。

const SLUG = 'wu-luo-qing';
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const SLOT_DATE = '2026-12-25';
const SLOT_START = '2026-12-25T03:00:00.000Z'; // Asia/Taipei 11:00

test('未登入 → 可瀏覽方案與日期；點「登入以完成預約」才導向 /login', async ({ page }) => {
  // 沒有 setTravelerSession：讓 supabase.auth.getUser() 取不到 user。
  await page.route('**/auth/v1/user**', (route: Route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ msg: 'no session' }) })
  );
  await page.route('**/api/guides/*/shop**', (route: Route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          guide: { id: 'g1', slug: SLUG, displayName: '吳洛晴', region: '高雄' },
          activitiesByRegion: [
            { region: '高雄', activities: [
              { id: ACTIVITY_ID, slug: 'power', title: '力量', region: '高雄', regionSlug: 'kaohsiung',
                plans: [{ id: PLAN_ID, name: '漂漂', basePrice: 610, priceType: 'per_person', duration: '1小時10分鐘', minParticipants: 1, maxParticipants: 4 }] },
            ] },
          ],
        },
      }),
    })
  );
  await page.route('**/api/v2/activities/*/available-slots**', (route: Route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          timezone: 'Asia/Taipei',
          dateAvailability: [{ date: SLOT_DATE, state: 'available', capacityLeft: 5 }],
          slots: [{ startAt: SLOT_START, endAt: '2026-12-25T04:10:00.000Z', capacityLeft: 5, isAvailable: true }],
        },
      }),
    })
  );

  await page.goto(`/guides/${SLUG}/shop/book`);

  // 匿名不再被 redirect；mock 全店僅一方案 → 自動預選並直接落在 step 2（月曆）。
  await expect(page).toHaveURL(new RegExp(`/guides/${SLUG}/shop/book`));
  await expect(page.getByTestId('shop-plan-summary')).toBeVisible();

  // step 2：月曆與時段照常可選，聯絡欄位換成登入卡。
  await page.getByTestId('shop-date').first().click();
  await page.getByTestId('shop-slot').first().click();
  await expect(page.getByTestId('shop-login-card')).toBeVisible();

  // 點「登入以完成預約」→ /login?next=/guides/[slug]/shop/book。
  await page.getByTestId('shop-login-cta').click();
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get('next') || '')).toContain(`/guides/${SLUG}/shop/book`);
});

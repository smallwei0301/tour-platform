import { test, expect, setTravelerSession } from './helpers';
import type { Route, Page } from '@playwright/test';

/**
 * #multilingual — /booking/[activityId]（V2 預約頁）的中英 i18n render smoke。
 * 真實瀏覽器、backend mock。完整 V2 slot/付款流程需大量 availability mock；此 smoke
 * 聚焦於頁面層級的 i18n（breadcrumb、進度步驟、排期選擇標籤）在中英下正確渲染。
 */

const SLUG = 'kaohsiung-chaishan-cave-experience';

const PLAN_ID = 'plan-1';

const ACTIVITY = {
  id: 'act-e2e',
  title: '蘭嶼夜觀生態導覽',
  priceTwd: 1600,
  timezone: 'Asia/Taipei',
  maxParticipants: 10,
  minParticipants: 1,
  schedules: [],
  plans: [{ id: PLAN_ID, slug: PLAN_ID, status: 'active', name: '夜觀方案', label: '夜觀方案', basePrice: 1600, priceType: 'per_person' }],
  guide: { displayName: '小明嚮導' },
};

async function mockBooking(page: Page) {
  await page.route(`**/api/activities/${SLUG}`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: ACTIVITY }) });
  });
  // V2 availability：回空 slots（不 hang），讓頁面層級 chrome 正常渲染。
  await page.route('**/api/v2/activities/**/available-slots**', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { slots: [], dates: [], reason: '' } }) });
  });
  await page.route('**/api/me/csrf', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

async function setLocale(page: Page, locale: string) {
  await page.context().addCookies([
    { name: 'NEXT_LOCALE', value: locale, url: process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3333' },
  ]);
}

test.describe('@multilingual /booking i18n', () => {
  test('zh-Hant 進度步驟與 breadcrumb 繁中', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'zh-Hant');
    await mockBooking(page);
    await page.goto(`/booking/${SLUG}?plan=${PLAN_ID}`);
    await expect(page.getByText('👥 參加人數')).toBeVisible();
    await expect(page.getByRole('heading', { name: '費用明細' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '預約摘要' })).toBeVisible();
    await page.screenshot({ path: 'test-results/booking-zh.png', fullPage: true });
  });

  test('en 進度步驟與 breadcrumb 英文', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'en');
    await mockBooking(page);
    await page.goto(`/booking/${SLUG}?plan=${PLAN_ID}`);
    await expect(page.getByText('👥 Number of participants')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fee details' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Booking summary' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore Routes' })).toBeVisible();
    await page.screenshot({ path: 'test-results/booking-en.png', fullPage: true });
  });
});

import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

// #1475 — 導遊商店預約流程（真實瀏覽器，backend 以 page.route mock）。
// 涵蓋：選方案 → 人數 → 日期/時段 → 建立 draft → 付款步驟（信用卡 + 自行匯款）。

const SLUG = 'wu-luo-qing';
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const BOOKING_ID = '33333333-3333-4333-8333-333333333333';
const SLOT_DATE = '2026-12-25';
const SLOT_START = '2026-12-25T03:00:00.000Z'; // Asia/Taipei 11:00

async function mockShopBackend(page: import('@playwright/test').Page) {
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
  await page.route('**/api/me/profile**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { displayName: '王小明', phone: '0912345678' } }) })
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
  await page.route('**/api/v2/bookings/draft', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { bookingId: BOOKING_ID, orderId: 'o1', amount: 610, currency: 'TWD' } }) })
  );
}

test.beforeEach(async ({ page }) => {
  await setTravelerSession(page);
  await mockShopBackend(page);
});

async function reachPaymentStep(page: import('@playwright/test').Page) {
  await page.goto(`/guides/${SLUG}/shop/book`);
  // mock 全店只有一個方案 → 自動預選並直接落在 step 2（日期/時段），
  // 不再重列方案（選購流程順化；方案摘要卡可更換方案）。
  await expect(page.getByTestId('shop-plan-summary')).toBeVisible();
  await page.getByTestId('shop-date').first().click();
  await page.getByTestId('shop-slot').first().click();
  await page.getByRole('button', { name: /確認這個時段/ }).click();
}

test('信用卡付款：走到付款步驟並送出 ecpay checkout', async ({ page }) => {
  let checkoutBody: any = null;
  await page.route(`**/api/v2/bookings/${BOOKING_ID}/checkout`, (route: Route) => {
    checkoutBody = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { provider: 'ecpay', paymentFormHtml: '<form action="about:blank" method="POST"></form>' } }) });
  });

  await reachPaymentStep(page);
  await expect(page.getByText('確認與付款')).toBeVisible();
  await page.getByRole('button', { name: /前往付款/ }).click();
  await expect.poll(() => checkoutBody?.provider).toBe('ecpay');
});

test('自行匯款：顯示匯款資訊並送出 transfer checkout，導向訂單頁', async ({ page }) => {
  await page.route(`**/api/v2/bookings/${BOOKING_ID}/transfer-info**`, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { configured: true, guideName: '吳洛晴', bankName: '國泰世華 三民分行', accountName: '吳洛晴', accountNumber: '0123456789', transferNote: '24 小時內完成' } }) })
  );
  let transferProvider: string | null = null;
  await page.route(`**/api/v2/bookings/${BOOKING_ID}/checkout`, (route: Route) => {
    transferProvider = JSON.parse(route.request().postData() || '{}').provider;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { provider: 'transfer', paymentFormHtml: null, awaitingManualPayment: true } }) });
  });
  // orders 頁需要這支
  await page.route('**/api/me/orders**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) })
  );

  await reachPaymentStep(page);
  await page.getByTestId('shop-pay-transfer').click();
  await expect(page.getByTestId('shop-transfer-info')).toContainText('0123456789');
  await page.getByRole('button', { name: /我已匯款/ }).click();
  await expect.poll(() => transferProvider).toBe('transfer');
  await expect(page).toHaveURL(/\/shop\/orders/);
});

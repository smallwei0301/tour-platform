/**
 * Admin conflict override on a pure instant (dynamic) plan must be bookable by
 * travellers. available-slots returns the re-opened slot with
 * canonicalState='allowed_with_admin_override' and scheduleId=null (it is a
 * rule-based dynamic slot, not a fixed activity_schedules row). The traveller
 * must be able to pick it and create a draft WITHOUT a synthetic scheduleId.
 *
 * Public booking page → no authedPage. Mock /api/activities and
 * /api/v2/.../available-slots; intercept /api/v2/bookings/draft.
 */
import { test, expect } from '@playwright/test';

const ACTIVITY_ID = 'a-ovr-test';
const PLAN_ID = 'p-ovr-test';

const ACTIVITY_FIXTURE = {
  id: ACTIVITY_ID,
  slug: 'override-fixture',
  title: '例外加開測試行程',
  shortDescription: 'override 測試',
  region: 'taipei',
  regionSlug: 'taipei',
  category: 'culture',
  priceTwd: 2000,
  status: 'published',
  coverImageUrl: null,
  ratingAvg: null,
  reviewCount: 0,
  refundRules: ['出發前 7 日可全額退款'],
  plans: [
    {
      id: PLAN_ID,
      slug: 'full-day',
      label: '全日方案',
      duration: '480 分鐘',
      price: 2000,
      bookingBtnText: '立即預約',
      detailsLinkText: '查看詳情',
      highlights: [],
      minParticipants: 1,
      maxParticipants: 8,
    },
  ],
  schedules: [],
};

const DATE = '2030-07-06';
// 即時方案、被既有半日預約擋住、管理者例外開放的全日時段(scheduleId 為 null)。
const OVERRIDE_SLOT = {
  startAt: `${DATE}T01:00:00.000Z`, // 09:00 Taipei
  endAt: `${DATE}T09:00:00.000Z`, // 17:00 Taipei
  capacityLeft: 6,
  bookingType: 'instant' as const,
  isAvailable: true,
  scheduleId: null,
  canonicalState: 'allowed_with_admin_override',
  conflictOverride: {
    id: 'ovr-1',
    reason: '找到幫手，例外加開全日',
    requiresHelper: true,
    helperStatus: 'required',
    guideNote: '已找到幫手李小幫，請協調',
  },
};

async function stubOverridePlan(page: import('@playwright/test').Page) {
  await page.route(`**/api/activities/${ACTIVITY_FIXTURE.slug}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: ACTIVITY_FIXTURE }),
    }),
  );
  await page.route(`**/api/v2/activities/${ACTIVITY_ID}/available-slots**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          activityId: ACTIVITY_ID,
          planId: PLAN_ID,
          selectedPlan: {
            id: PLAN_ID,
            name: '全日方案',
            priceType: 'per_person',
            basePrice: 2000,
            minParticipants: 1,
            maxParticipants: 8,
            bookingType: 'instant',
          },
          slots: [OVERRIDE_SLOT],
          dateAvailability: [
            {
              date: DATE,
              state: 'available',
              capacityLeft: OVERRIDE_SLOT.capacityLeft,
              firstAvailableStartAt: OVERRIDE_SLOT.startAt,
              selectedSlot: OVERRIDE_SLOT,
            },
          ],
        },
      }),
    }),
  );
  await page.route('**/api/me/wishlist/ids', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }),
  );
}

test('traveler can book an admin-override instant slot; draft carries no synthetic scheduleId', async ({ page }) => {
  await stubOverridePlan(page);

  let draftBody: Record<string, unknown> | undefined;
  await page.route('**/api/v2/bookings/draft', (route) => {
    draftBody = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { bookingId: 'b-ovr-1', requiresApproval: false } }),
    });
  });

  await page.goto(`/booking/${ACTIVITY_FIXTURE.slug}?plan=${PLAN_ID}&date=${DATE}`, {
    waitUntil: 'domcontentloaded',
  });

  // The re-opened slot shows as bookable (09:00).
  await expect(page.locator('text=可預約，剩餘')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /下一步：填寫資訊/ }).click();
  await page.getByPlaceholder('請輸入真實姓名').fill('測試旅客');
  await page.getByPlaceholder('0912-345-678').fill('0912345678');
  await page.getByPlaceholder('you@example.com').fill('traveler@example.com');
  await page.locator('input[name="agreement"]').check();
  await page.getByRole('button', { name: /建立訂單並前往付款/ }).click();

  await expect.poll(() => draftBody?.startAt, { timeout: 10_000 }).toBe(OVERRIDE_SLOT.startAt);
  // Override dynamic slots are not real schedules → scheduleId must not be sent.
  assertNoScheduleId(draftBody);
});

function assertNoScheduleId(body: Record<string, unknown> | undefined) {
  expect(body).toBeTruthy();
  // scheduleId is either absent or undefined; never the override id.
  expect(body?.scheduleId === undefined || body?.scheduleId === null).toBeTruthy();
  expect(body?.scheduleId).not.toBe('ovr-1');
}

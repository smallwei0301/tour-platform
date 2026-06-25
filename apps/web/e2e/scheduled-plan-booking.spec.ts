/**
 * 排程預約（scheduled）— 旅客只能預約預先建立的固定場次（activity_schedules）。
 *
 * 本 spec 驗證完整實裝後的旅客端行為：
 *   1. available-slots 為 scheduled 方案列出多個固定場次，每個 slot 帶自己的 scheduleId。
 *   2. 旅客選取某個場次並送出時，draft 帶的是「該選取場次」的 scheduleId（而非 URL 帶入值）。
 *
 * Booking 是公開頁，不需要 authedPage。沿用 #1306 的 stub 模式：mock /api/activities
 * 與 /api/v2/.../available-slots，並攔截 /api/v2/bookings/draft 斷言送出的 scheduleId。
 */
import { test, expect } from '@playwright/test';

const ACTIVITY_ID = 'a-sched-test';
const PLAN_ID = 'p-sched-test';

const ACTIVITY_FIXTURE = {
  id: ACTIVITY_ID,
  slug: 'scheduled-fixture',
  title: '排程預約測試行程',
  shortDescription: '固定場次測試',
  region: 'taipei',
  regionSlug: 'taipei',
  category: 'culture',
  priceTwd: 1000,
  status: 'published',
  coverImageUrl: null,
  ratingAvg: null,
  reviewCount: 0,
  refundRules: ['出發前 7 日可全額退款'],
  plans: [
    {
      id: PLAN_ID,
      slug: 'default',
      label: '標準方案',
      duration: '120 分鐘',
      price: 1000,
      bookingBtnText: '立即預約',
      detailsLinkText: '查看詳情',
      highlights: [],
      minParticipants: 1,
      maxParticipants: 10,
    },
  ],
  schedules: [],
};

const DATE = '2030-07-05';
// 兩個同日固定場次，各自帶不同的 scheduleId。
const SLOT_A = {
  startAt: `${DATE}T01:00:00.000Z`, // 09:00 Taipei
  endAt: `${DATE}T03:00:00.000Z`,
  capacityLeft: 8,
  bookingType: 'scheduled' as const,
  isAvailable: true,
  scheduleId: 'sched-A',
};
const SLOT_B = {
  startAt: `${DATE}T06:00:00.000Z`, // 14:00 Taipei
  endAt: `${DATE}T08:00:00.000Z`,
  capacityLeft: 5,
  bookingType: 'scheduled' as const,
  isAvailable: true,
  scheduleId: 'sched-B',
};

async function stubScheduledPlan(page: import('@playwright/test').Page) {
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
            name: '標準方案',
            priceType: 'per_person',
            basePrice: 1000,
            minParticipants: 1,
            maxParticipants: 10,
            bookingType: 'scheduled',
          },
          slots: [SLOT_A, SLOT_B],
          dateAvailability: [
            {
              date: DATE,
              state: 'available',
              capacityLeft: SLOT_A.capacityLeft,
              firstAvailableStartAt: SLOT_A.startAt,
              selectedSlot: SLOT_A,
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

test('scheduled plan lists each fixed session as a pickable slot', async ({ page }) => {
  await stubScheduledPlan(page);
  await page.goto(`/booking/${ACTIVITY_FIXTURE.slug}?plan=${PLAN_ID}&date=${DATE}`, {
    waitUntil: 'domcontentloaded',
  });

  const picker = page.getByTestId('traveler-slot-picker');
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('traveler-slot-option')).toHaveCount(2);
  await expect(picker).toContainText('09:00');
  await expect(picker).toContainText('14:00');
});

test('selecting a session sends that session scheduleId to the draft', async ({ page }) => {
  await stubScheduledPlan(page);

  let draftScheduleId: string | undefined;
  await page.route('**/api/v2/bookings/draft', (route) => {
    draftScheduleId = route.request().postDataJSON()?.scheduleId;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { bookingId: 'b-sched-1', requiresApproval: false } }),
    });
  });

  await page.goto(`/booking/${ACTIVITY_FIXTURE.slug}?plan=${PLAN_ID}&date=${DATE}`, {
    waitUntil: 'domcontentloaded',
  });

  const options = page.getByTestId('traveler-slot-option');
  await expect(options).toHaveCount(2);
  // 選第二個場次（sched-B / 14:00）。
  await options.nth(1).click();
  await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true');

  // 進入步驟二填寫資訊。
  await page.getByRole('button', { name: /下一步：填寫資訊/ }).click();
  await page.getByPlaceholder('請輸入真實姓名').fill('測試旅客');
  await page.getByPlaceholder('0912-345-678').fill('0912345678');
  await page.getByPlaceholder('you@example.com').fill('traveler@example.com');
  await page.locator('input[name="agreement"]').check();

  await page.getByRole('button', { name: /建立訂單並前往付款/ }).click();

  // 送出的 scheduleId 必須是選取的場次（sched-B），而非 sched-A 或 URL 帶入值。
  await expect.poll(() => draftScheduleId, { timeout: 10_000 }).toBe('sched-B');
});

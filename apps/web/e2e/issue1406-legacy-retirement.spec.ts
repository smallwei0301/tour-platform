import { test, expect } from '@playwright/test';

/**
 * Issue #1406 — Legacy 退役階段二：移除 flag fallback UI 與 legacy 入口。
 *
 * 驗證：無任何 UI 路徑可達 legacy checkout/booking 流程。
 *  - /booking/[slug] 殼層一律渲染 Booking V2（三步驟 V2 shell），不再有 legacy fallback；
 *  - 預約流程只呼叫 V2 available-slots -> draft -> checkout，不觸碰 legacy /api/orders；
 *  - 頁面不含任何指向 legacy /checkout 的連結。
 *
 * 依 CLAUDE.md e2e 準則：backend 以 page.route() mock，不依賴 Supabase seed。
 */

const SLUG = 'kaohsiung-chaishan-cave-experience';
const PLAN_ID = '22222222-2222-2222-2222-222222222222';
const ACTIVITY_ID = '11111111-1111-1111-1111-111111111111';
const BOOKING_URL = `/booking/${SLUG}?plan=${PLAN_ID}&date=2026-08-20`;
const EARLIEST_START_AT = '2026-08-20T01:00:00.000Z';

const ACTIVITY_FIXTURE = {
  id: ACTIVITY_ID,
  slug: SLUG,
  title: '柴山探洞體驗',
  region: '高雄市',
  priceTwd: 1800,
  priceLabel: '每人',
  durationDisplay: '3 小時',
  coverImageUrl: '',
  refundRules: ['活動前 7 日可全額退款'],
  maxParticipants: 8,
  minParticipants: 1,
  schedules: [
    { id: 'sch_1', startAt: EARLIEST_START_AT, capacity: 8, bookedCount: 1, status: 'open', planId: PLAN_ID },
  ],
  plans: [
    { id: PLAN_ID, status: 'active', name: '半日探洞', displayName: '半日探洞', basePrice: 1800, priceType: 'per_person', minParticipants: 1, maxParticipants: 8 },
  ],
};

test.describe('Issue #1406 — legacy checkout/booking 已無 UI 路徑可達', () => {
  test('T1406.1 — /booking renders V2 shell only and wires V2 draft+checkout (no legacy /api/orders)', async ({ page }) => {
    let legacyOrdersCalled = false;

    await page.route(`**/api/activities/${SLUG}`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: ACTIVITY_FIXTURE }) });
    });
    await page.route('**/api/activities', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [ACTIVITY_FIXTURE] }) });
    });

    await page.route('**/api/v2/activities/*/available-slots**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            activityId: ACTIVITY_ID,
            planId: PLAN_ID,
            selectedPlan: { id: PLAN_ID, displayName: '半日探洞', priceType: 'per_person', basePrice: 1800, minParticipants: 1, maxParticipants: 8, bookingType: 'instant' },
            slots: [{ startAt: EARLIEST_START_AT, endAt: EARLIEST_START_AT, isAvailable: true, capacityLeft: 7, bookingType: 'instant' }],
            dateAvailability: [{ date: '2026-08-20', state: 'available', capacityLeft: 7, reason: '', messageZh: '', firstAvailableStartAt: EARLIEST_START_AT }],
          },
        }),
      });
    });

    // legacy 下單端點：若被呼叫即代表退役未完成
    await page.route('**/api/orders**', async (route) => {
      legacyOrdersCalled = true;
      await route.abort();
    });

    const response = await page.goto(BOOKING_URL);
    expect(response?.status()).toBe(200);

    // 仍停留在 V2 /booking 入口，未被導向 legacy /checkout
    expect(new URL(page.url()).pathname).toContain(`/booking/${SLUG}`);

    // V2 shell 標記：日期/容量 picker 只在 V2 殼層存在
    await expect(page.locator('[data-testid="booking-v2-date-capacity-picker"]')).toBeVisible({ timeout: 15_000 });

    // 頁面不得含任何指向 legacy /checkout 的連結
    await expect(page.locator('a[href*="/checkout"]')).toHaveCount(0);

    expect(legacyOrdersCalled).toBe(false);
  });

  test('T1406.2 — booking page exposes no legacy /checkout navigation affordance', async ({ page }) => {
    await page.route(`**/api/activities/${SLUG}`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: ACTIVITY_FIXTURE }) });
    });
    await page.route('**/api/activities', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [ACTIVITY_FIXTURE] }) });
    });
    await page.route('**/api/v2/activities/*/available-slots**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { activityId: ACTIVITY_ID, planId: PLAN_ID, slots: [], dateAvailability: [] } }),
      });
    });

    await page.goto(BOOKING_URL);

    // 無論可用性如何，殼層都不得提供回退 legacy checkout 的連結或「改用舊版預約流程」按鈕
    await expect(page.locator('a[href*="/checkout"]')).toHaveCount(0);
    await expect(page.getByText('改用舊版預約流程')).toHaveCount(0);
  });
});

import { test, expect } from './helpers';
import type { Page, Route } from '@playwright/test';

/**
 * Issue #1257 — Traveler-layer browser E2E for the Admin conflict-exception override.
 *
 * Closes the one gap noted in the #1273 acceptance review: the traveler booking
 * path was only verified at the API/resolver contract layer. This drives the real
 * /booking page in a browser and proves:
 *   1. an `allowed_with_admin_override` slot is shown as bookable and the traveler
 *      can create a draft for that EXACT slot (the override slot start time);
 *   2. WITHOUT a matching override the same conflicting slot is NOT bookable;
 *   3. the override's internal adminNote is never rendered on the traveler surface
 *      (sentinel injected into the mocked public payload).
 *
 * Backend is mocked via page.route (no Supabase seed), matching the existing
 * e2e/issue1237-booking-v2-entry-and-recovery.spec.ts pattern.
 */

const ACTIVITY_UUID = '1257aaaa-2222-4333-8444-555555555555';
const ACTIVITY_SLUG = 'green-island-night-dive';
const PLAN_ID = 'plan-fullday-1257';
const DATE = '2030-04-12';
const OVERRIDE_START = '2030-04-12T09:00:00+08:00'; // full-day slot blocked by a half-day booking
const OVERRIDE_END = '2030-04-12T17:00:00+08:00';
const INTERNAL_ADMIN_NOTE = '內部機密-後台核准-勿外洩';

const ACTIVITY_RESPONSE = {
  ok: true,
  data: {
    id: ACTIVITY_UUID,
    slug: ACTIVITY_SLUG,
    title: '綠島夜潛體驗',
    priceTwd: 4800,
    priceLabel: 'NT$4,800 / 人',
    durationDisplay: '約 8 小時',
    region: '台東',
    coverImageUrl: null,
    refundRules: [],
    minParticipants: 1,
    maxParticipants: 8,
    schedules: [],
    plans: [
      {
        id: PLAN_ID,
        slug: 'full-day',
        status: 'active',
        name: '全日包場',
        displayName: '全日包場',
        basePrice: 4800,
        priceType: 'per_person',
        minParticipants: 1,
        maxParticipants: 8,
      },
    ],
    guide: { displayName: '海風阿德' },
  },
};

const SELECTED_PLAN = {
  id: PLAN_ID,
  name: '全日包場',
  displayName: '全日包場',
  basePrice: 4800,
  priceType: 'per_person',
  minParticipants: 1,
  maxParticipants: 8,
};

// An allowed_with_admin_override slot — the public available-slots contract marks
// it available. We inject adminNote to prove the traveler UI never surfaces it.
function overrideSlot(isAvailable: boolean) {
  return {
    startAt: OVERRIDE_START,
    endAt: OVERRIDE_END,
    capacityLeft: 8,
    bookingType: 'instant',
    isAvailable,
    scheduleId: null,
    planId: PLAN_ID,
    canonicalState: isAvailable ? 'allowed_with_admin_override' : 'blocked_by_conflict',
    conflictOverride: isAvailable
      ? {
          reason: 'VIP 客訴補救',
          requiresHelper: true,
          helperStatus: 'required',
          guideNote: '導遊已知悉',
          adminNote: INTERNAL_ADMIN_NOTE, // sentinel — must never render to travelers
        }
      : null,
  };
}

function availableSlotsBody(isAvailable: boolean) {
  const slot = overrideSlot(isAvailable);
  return {
    success: true,
    data: {
      activityId: ACTIVITY_UUID,
      planId: PLAN_ID,
      timezone: 'Asia/Taipei',
      selectedPlan: SELECTED_PLAN,
      reason: isAvailable ? '' : 'blocked_by_conflict',
      dateAvailability: [
        {
          date: DATE,
          state: isAvailable ? 'available' : 'blocked',
          capacityLeft: isAvailable ? 8 : 0,
          reason: isAvailable ? '' : 'blocked_by_conflict',
          messageZh: isAvailable ? '' : '此時段與其他行程衝突，目前無法預約',
          selectedSlot: isAvailable ? slot : undefined,
        },
      ],
      slots: [slot],
    },
  };
}

async function installRoutes(page: Page, { available }: { available: boolean }) {
  await page.route('**/api/activities/**', async (route: Route) => {
    const identifier = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() || '');
    if (identifier === ACTIVITY_SLUG) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACTIVITY_RESPONSE) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'not found' } }) });
  });

  await page.route(`**/api/v2/activities/${ACTIVITY_UUID}/available-slots**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(availableSlotsBody(available)) });
  });
}

async function warm(page: Page) {
  await page.request.get(`/booking/${ACTIVITY_SLUG}?plan=${PLAN_ID}&date=${DATE}`, { failOnStatusCode: false, timeout: 60_000 });
}

test.describe('GH-1257 — traveler can book only the exact admin-overridden conflict slot', () => {
  test.describe.configure({ timeout: 90_000 });

  test('allowed_with_admin_override slot is bookable: draft targets the exact override slot, adminNote stays hidden', async ({ page }) => {
    await installRoutes(page, { available: true });
    await warm(page);

    const draftPosts: Array<Record<string, unknown>> = [];
    await page.route('**/api/v2/bookings/draft', async (route: Route) => {
      draftPosts.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { bookingId: '1257bbbb-cccc-4ddd-8eee-ffffffffffff' } }),
      });
    });

    await page.goto(`/booking/${ACTIVITY_SLUG}?plan=${PLAN_ID}&date=${DATE}`, { waitUntil: 'commit', timeout: 60_000 });
    await expect(page.getByText('綠島夜潛體驗').first()).toBeVisible({ timeout: 20_000 });

    // Step 1 — the overridden slot is presented as bookable.
    await expect(page.getByText(`${DATE}（可預約`)).toBeVisible({ timeout: 20_000 });
    const nextBtn = page.getByRole('button', { name: /下一步：填寫資訊/ });
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();

    // Step 2 — contact info, then create the draft booking.
    await page.getByPlaceholder('請輸入真實姓名').fill('測試旅客');
    await page.getByPlaceholder('0912-345-678').fill('0912345678');
    await page.getByPlaceholder('you@example.com').fill('traveler@example.com');
    await page.locator('input[name="agreement"]').check();
    await page.getByRole('button', { name: /建立訂單並前往付款/ }).click();

    // The draft request booked the EXACT overridden slot start time.
    await expect.poll(() => draftPosts.length).toBe(1);
    expect(draftPosts[0].startAt).toBe(OVERRIDE_START);
    expect(draftPosts[0].planId).toBe(PLAN_ID);

    // Reaching Step 3 confirms create accepted the override slot.
    await expect(page.getByText('付款確認（建立預約後）')).toBeVisible({ timeout: 20_000 });

    // Privacy: the override's internal admin note never reaches the traveler DOM.
    await expect(page.getByText(INTERNAL_ADMIN_NOTE)).toHaveCount(0);
  });

  test('without a matching override, the same conflicting slot is NOT bookable', async ({ page }) => {
    await installRoutes(page, { available: false });
    await warm(page);

    await page.goto(`/booking/${ACTIVITY_SLUG}?plan=${PLAN_ID}&date=${DATE}`, { waitUntil: 'commit', timeout: 60_000 });
    await expect(page.getByText('綠島夜潛體驗').first()).toBeVisible({ timeout: 20_000 });

    await expect(page.getByText(`${DATE}（此日期目前無可預約名額）`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /下一步：填寫資訊/ })).toBeDisabled();
  });
});

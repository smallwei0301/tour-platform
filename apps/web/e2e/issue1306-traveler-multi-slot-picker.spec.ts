/**
 * Issue #1306 — traveler booking page must show every available slot the
 * V2 API returns for the selected date, not collapse them into a single
 * canonical slot.
 *
 * Before the fix:
 *   - `setSlots([canonicalSelectedSlot])` (page.tsx ~line 715) reduced N
 *     slots to 1, so the UI only had one selectable time.
 *   - The slot picker UI didn't even exist — only a single summary line
 *     said "可預約，剩餘 N".
 *
 * After the fix:
 *   - `setSlots(selectedDateSlots)` preserves every available slot.
 *   - A `role="radiogroup"` slot picker renders when slots.length > 1.
 *
 * No `authedPage` fixture — booking is public. We mock both /api/activities
 * (so we don't depend on real DB seed) and /api/v2/.../available-slots
 * to return N >= 2 slots for the picked date.
 */
import { test, expect } from '@playwright/test';

const ACTIVITY_ID = 'a-1306-test';
const PLAN_ID = 'p-1306-test';

const ACTIVITY_FIXTURE = {
  id: ACTIVITY_ID,
  slug: 'multi-slot-fixture',
  title: '多時段測試行程',
  shortDescription: '多時段測試',
  region: 'taipei',
  regionSlug: 'taipei',
  category: 'culture',
  priceTwd: 1000,
  status: 'published',
  coverImageUrl: null,
  ratingAvg: null,
  reviewCount: 0,
  plans: [
    {
      id: PLAN_ID,
      slug: 'default',
      label: '標準方案',
      duration: '60 分鐘',
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

function buildSlot(startISO: string, endISO: string, capacityLeft = 9) {
  return {
    startAt: startISO,
    endAt: endISO,
    capacityLeft,
    bookingType: 'instant',
    isAvailable: true,
  };
}

async function stubAvailableSlots(
  page: import('@playwright/test').Page,
  slots: Array<{ startAt: string; endAt: string; capacityLeft?: number; isAvailable?: boolean }>,
  selectedDate: string,
) {
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
          slots,
          dateAvailability: [
            {
              date: selectedDate,
              state: 'available',
              capacityLeft: slots[0]?.capacityLeft ?? 0,
              firstAvailableStartAt: slots[0]?.startAt,
              selectedSlot: slots[0],
            },
          ],
        },
      }),
    }),
  );
  await page.route('**/api/me/wishlist/ids', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    }),
  );
}

test('multi-slot day: traveler picker exposes every available slot, not just one', async ({ page }) => {
  const date = '2026-06-15';
  // 11 sequential one-hour slots, mirroring the production evidence in #1306.
  const slots = Array.from({ length: 11 }, (_, i) => {
    const startHourUtc = 1 + i; // 09:00 Taipei = 01:00 UTC
    const startISO = `${date}T${String(startHourUtc).padStart(2, '0')}:00:00.000Z`;
    const endISO = `${date}T${String(startHourUtc + 1).padStart(2, '0')}:00:00.000Z`;
    return buildSlot(startISO, endISO);
  });
  await stubAvailableSlots(page, slots, date);

  await page.goto(`/booking/${ACTIVITY_FIXTURE.slug}?plan=${PLAN_ID}&date=${date}`, { waitUntil: 'domcontentloaded' });

  const picker = page.getByTestId('traveler-slot-picker');
  await expect(picker).toBeVisible({ timeout: 15_000 });

  const options = page.getByTestId('traveler-slot-option');
  // All 11 slots must render — the previous behaviour collapsed them to 1.
  await expect(options).toHaveCount(11);

  // Picker must surface the actual Taipei-local times (per the issue's
  // parity requirement). 11 slots from 09:00 → 19:00 should include both.
  await expect(picker).toContainText('09:00');
  await expect(picker).toContainText('19:00');
});

test('multi-slot day: clicking a different slot updates the selection', async ({ page }) => {
  const date = '2026-06-15';
  const slots = [
    buildSlot(`${date}T01:00:00.000Z`, `${date}T02:00:00.000Z`),
    buildSlot(`${date}T05:00:00.000Z`, `${date}T06:00:00.000Z`),
  ];
  await stubAvailableSlots(page, slots, date);
  await page.goto(`/booking/${ACTIVITY_FIXTURE.slug}?plan=${PLAN_ID}&date=${date}`, { waitUntil: 'domcontentloaded' });

  const options = page.getByTestId('traveler-slot-option');
  await expect(options).toHaveCount(2);

  // First option auto-selected on render (aria-checked=true).
  await expect(options.nth(0)).toHaveAttribute('aria-checked', 'true');
  await expect(options.nth(1)).toHaveAttribute('aria-checked', 'false');

  await options.nth(1).click();
  await expect(options.nth(0)).toHaveAttribute('aria-checked', 'false');
  await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true');
});

test('single-slot day: no picker rendered (no UI regression for the common case)', async ({ page }) => {
  const date = '2026-06-16';
  const slots = [buildSlot(`${date}T01:00:00.000Z`, `${date}T02:00:00.000Z`)];
  await stubAvailableSlots(page, slots, date);
  await page.goto(`/booking/${ACTIVITY_FIXTURE.slug}?plan=${PLAN_ID}&date=${date}`, { waitUntil: 'domcontentloaded' });

  // The summary line still appears, but the picker stays hidden when N=1.
  await expect(page.locator('text=可預約，剩餘')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('traveler-slot-picker')).toHaveCount(0);
});

// Issue #1306 acceptance #5 — when the server returns a mix of available and
// unavailable slots for the date, the picker must only render the available
// ones. This keeps #1289's fixed-candidate conflict filtering honest at the
// client edge too: even if a stale unavailable slot leaks past the server,
// the client's `.filter(slot.isAvailable)` step hides it from the picker.
test('mixed availability day: only isAvailable=true slots reach the picker (#1306 acceptance #5)', async ({ page }) => {
  const date = '2026-06-17';
  // 6 slots: 3 available (09:00, 11:00, 13:00) interleaved with 3 unavailable
  // (10:00, 12:00, 14:00). The picker must show only the 3 available ones.
  const slots = [
    { ...buildSlot(`${date}T01:00:00.000Z`, `${date}T02:00:00.000Z`), isAvailable: true },
    { ...buildSlot(`${date}T02:00:00.000Z`, `${date}T03:00:00.000Z`), isAvailable: false },
    { ...buildSlot(`${date}T03:00:00.000Z`, `${date}T04:00:00.000Z`), isAvailable: true },
    { ...buildSlot(`${date}T04:00:00.000Z`, `${date}T05:00:00.000Z`), isAvailable: false },
    { ...buildSlot(`${date}T05:00:00.000Z`, `${date}T06:00:00.000Z`), isAvailable: true },
    { ...buildSlot(`${date}T06:00:00.000Z`, `${date}T07:00:00.000Z`), isAvailable: false },
  ];
  await stubAvailableSlots(page, slots, date);
  await page.goto(`/booking/${ACTIVITY_FIXTURE.slug}?plan=${PLAN_ID}&date=${date}`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('traveler-slot-picker')).toBeVisible({ timeout: 15_000 });
  const options = page.getByTestId('traveler-slot-option');
  // Only the 3 isAvailable=true slots, never the 3 isAvailable=false ones.
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toContainText('09:00');
  await expect(options.nth(1)).toContainText('11:00');
  await expect(options.nth(2)).toContainText('13:00');
});

/**
 * Issue #1495 — 新增場次 only applies to 排程預約 (scheduled) plans.
 *
 * Fixed schedules (activity_schedules) are meaningless for instant/request
 * plans (those use dynamic availability rules). The admin 新增場次 modal must
 * warn and disable submit when the resolved plan is instant/request; scheduled
 * plans behave as before.
 */
import { test, expect } from './helpers';

const ACTIVITY_ID = '33333333-3333-3333-3333-000000001495';

const MOCK_ACTIVITY = {
  ok: true,
  data: {
    id: ACTIVITY_ID,
    title: '測試行程 #1495',
    slug: 'test-1495',
    region: '台北市',
    category: 'outdoor',
    priceTwd: 1800,
    durationMinutes: 240,
    minParticipants: 1,
    maxParticipants: 10,
    description: '測試描述',
    shortDescription: '短描述',
    tagline: '標語',
    inclusions: [], exclusions: [], notices: [], refundRules: [], goodFor: [],
    socialProofQuotes: [], faq: [], itinerary: [], imageUrls: [],
    meetingPoint: '集合點', meetingPointMapUrl: '', coverImageUrl: '', safetyNotice: '',
    status: 'draft', plans: [], ratingAvg: null, reviewCount: 0,
  },
};

async function stubBasicPage(page: import('@playwright/test').Page) {
  await page.route(`**/api/admin/activities/${ACTIVITY_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY) }),
  );
  await page.route(`**/api/admin/activities/${ACTIVITY_ID}/schedules`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) }),
  );
  await page.route('**/api/admin/guides**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) }),
  );
}

function stubPlans(page: import('@playwright/test').Page, bookingType: string) {
  return page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          activity: { id: ACTIVITY_ID, title: '測試行程 #1495' },
          plans: [
            {
              id: 'aaaa1495-0000-0000-0000-000000001495',
              name: '即時方案',
              status: 'active',
              booking_type: bookingType,
              base_price: 1800,
              min_participants: 1,
              max_participants: 8,
              duration_minutes: 240,
            },
          ],
        },
      }),
    }),
  );
}

async function openModal(page: import('@playwright/test').Page) {
  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('text=場次管理', { timeout: 10000 });
  await page.locator('button:has-text("新增場次")').click();
  await page.waitForSelector('text=批次新增場次', { timeout: 5000 });
}

test('instant plan: modal warns and disables submit', async ({ authedPage: page }) => {
  await stubBasicPage(page);
  await stubPlans(page, 'instant');
  await openModal(page);

  await expect(page.getByTestId('schedule-booking-type-warning')).toBeVisible();
  await expect(page.getByRole("button", { name: /確認新增|新增中/ })).toBeDisabled();
});

test('scheduled plan: no warning (submit enabled once a date is picked)', async ({ authedPage: page }) => {
  await stubBasicPage(page);
  await stubPlans(page, 'scheduled');
  await openModal(page);

  await expect(page.getByTestId('schedule-booking-type-warning')).toHaveCount(0);
  // Pick the first selectable date → submit becomes enabled.
  await page.locator('button:has-text("週")').first().click();
  await expect(page.getByRole("button", { name: /確認新增|新增中/ })).toBeEnabled();
});

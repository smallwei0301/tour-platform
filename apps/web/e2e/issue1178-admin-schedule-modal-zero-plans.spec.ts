/**
 * Issue #1178 — Admin schedule modal: gate dropdown by active V2 plan count
 *
 * Part A only — AC1/AC2/AC3 cover the UI contract.
 *
 * AC1 (BUG REPRO, type:bug required):
 *   GIVEN 0 active V2 plans,
 *   WHEN admin opens 新增場次,
 *   THEN no selectable 全部方案, blocking copy visible, submit disabled.
 *
 * AC2:
 *   GIVEN exactly 1 active plan,
 *   WHEN admin opens 新增場次,
 *   THEN shows plan name (never 全部方案).
 *
 * AC3:
 *   GIVEN ≥2 active plans, admin submits without selecting,
 *   THEN modal blocks with 方案有多個，請選擇適用方案 and no POST fires.
 */
import { test, expect } from './helpers';

const ACTIVITY_ID = '22222222-2222-2222-2222-222222222222';

const MOCK_ACTIVITY = {
  ok: true,
  data: {
    id: ACTIVITY_ID,
    title: '測試行程 #1178',
    slug: 'test-1178',
    guideSlug: 'test-guide',
    region: '台北市',
    category: 'outdoor',
    priceTwd: 1800,
    durationMinutes: 240,
    minParticipants: 1,
    maxParticipants: 10,
    meetingPoint: '測試集合點',
    meetingPointMapUrl: '',
    coverImageUrl: '',
    imageUrls: [],
    description: '測試描述',
    shortDescription: '短描述',
    tagline: '標語',
    inclusions: [],
    exclusions: [],
    notices: [],
    refundRules: [],
    safetyNotice: '',
    goodFor: [],
    socialProofQuotes: [],
    faq: [],
    itinerary: [],
    status: 'draft',
    plans: [],
    ratingAvg: null,
    reviewCount: 0,
  },
};

const MOCK_SCHEDULES = { ok: true, data: [] };

/** Shared page setup: stubs activity + schedules + guides */
async function stubBasicPage(page: import('@playwright/test').Page) {
  await page.route(`**/api/admin/activities/${ACTIVITY_ID}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ACTIVITY),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });

  await page.route(`**/api/admin/activities/${ACTIVITY_ID}/schedules`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SCHEDULES) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { schedule: {} } }) });
    }
  });

  await page.route('**/api/admin/guides**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });
}

// ─── AC1: 0 active plans ──────────────────────────────────────────────────────

test('T1178.AC1 - zero active plans: modal shows blocking message and disables submit', async ({
  authedPage: page,
}) => {
  await stubBasicPage(page);

  // Mock V2 plans → empty (0 active plans)
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          activity: { id: ACTIVITY_ID, title: '測試行程 #1178' },
          plans: [],
        },
      }),
    });
  });

  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('text=場次管理', { timeout: 10000 });

  // Open the add-schedule modal
  await page.locator('button:has-text("新增場次")').click();
  await page.waitForSelector('text=批次新增場次', { timeout: 5000 });

  // AC1a: The modal must NOT show a selectable 全部方案 option
  await expect(page.locator('option:has-text("全部方案")')).not.toBeAttached();

  // AC1b: Blocking copy must be visible
  await expect(page.locator('text=此活動沒有可用的 V2 方案')).toBeVisible();

  // AC1c: Submit button must be disabled
  const submitBtn = page.locator('button[type="submit"]');
  await expect(submitBtn).toBeDisabled();
});

// ─── AC2: 1 active plan ───────────────────────────────────────────────────────

test('T1178.AC2 - exactly 1 active plan: shows plan name, never shows 全部方案', async ({
  authedPage: page,
}) => {
  await stubBasicPage(page);

  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          activity: { id: ACTIVITY_ID, title: '測試行程 #1178' },
          plans: [
            {
              id: 'aaaa1111-0000-0000-0000-000000001178',
              name: '早鳥半日探秘',
              status: 'active',
              booking_type: 'scheduled',
              base_price: 1800,
            },
          ],
        },
      }),
    });
  });

  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('text=場次管理', { timeout: 10000 });

  await page.locator('button:has-text("新增場次")').click();
  await page.waitForSelector('text=批次新增場次', { timeout: 5000 });

  // AC2a: 全部方案 must NOT appear at all
  await expect(page.locator('option:has-text("全部方案")')).not.toBeAttached();

  // AC2b: The plan name must be visible (either as option or as auto-apply text)
  await expect(page.locator('body')).toContainText('早鳥半日探秘');
});

// ─── AC3: ≥2 active plans, submit without selecting ──────────────────────────

test('T1178.AC3 - 2 active plans: submit without selecting blocks with 方案有多個', async ({
  authedPage: page,
}) => {
  await stubBasicPage(page);

  let postFired = false;
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/schedules`, async (route) => {
    postFired = true;
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'AMBIGUOUS_PLAN', message: 'ambiguous' } }),
    });
  });

  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          activity: { id: ACTIVITY_ID, title: '測試行程 #1178' },
          plans: [
            { id: 'aaaa1111-0000-0000-0000-000000001178', name: '早鳥半日探秘', status: 'active', booking_type: 'scheduled', base_price: 1800 },
            { id: 'bbbb2222-0000-0000-0000-000000001178', name: '全日深度探秘', status: 'active', booking_type: 'scheduled', base_price: 3000 },
          ],
        },
      }),
    });
  });

  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('text=場次管理', { timeout: 10000 });

  await page.locator('button:has-text("新增場次")').click();
  await page.waitForSelector('text=批次新增場次', { timeout: 5000 });

  // Select a date to satisfy the date-required guard
  const dayButtons = page
    .locator('div')
    .filter({ hasText: /^選擇日期/ })
    .locator('button[type="button"]')
    .filter({ hasText: /\d+\/\d+/ });
  await dayButtons.first().click();

  // AC3a: Submit WITHOUT selecting a plan
  await page.locator('button[type="submit"]').click();

  // AC3b: Client-side guard must show the blocking error
  await expect(page.locator('body')).toContainText('方案有多個，請選擇適用方案', { timeout: 3000 });

  // AC3c: No POST to /api/v2/admin/.../schedules should have fired
  expect(postFired).toBe(false);
});

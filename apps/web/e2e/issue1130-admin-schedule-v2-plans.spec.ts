/**
 * Issue #1130 - Admin schedule modal: source plans from V2 activity_plans
 *
 * Coverage:
 *   T1130.1 - plan dropdown shows V2 plan names (not half-day/full-day labels)
 *   T1130.2 - archived plan is excluded from dropdown
 *   T1130.3 - schedule create POST hits /api/v2/ endpoint with UUID planId
 *   T1130.4 - 422 AMBIGUOUS_PLAN error message displayed in modal
 *
 * Strategy:
 *   - Use page.route() to mock:
 *       GET  /api/v2/admin/activities/:id/plans   -- 2 active + 1 archived plan
 *       POST /api/v2/admin/activities/:id/schedules -- success response
 *   - Admin activity edit page loads real UI; only API calls are stubbed.
 *   - Does NOT depend on Supabase seed data.
 */
import { test, expect } from './helpers';

const ACTIVITY_ID = '11111111-1111-1111-1111-111111111111';

const MOCK_PLANS = {
  ok: true,
  data: {
    activity: { id: ACTIVITY_ID, title: '測試行程' },
    plans: [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: '早鳥半日探秘',
        status: 'active',
        booking_type: 'scheduled',
        base_price: 1800,
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        name: '全日深度探秘',
        status: 'active',
        booking_type: 'scheduled',
        base_price: 3000,
      },
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        name: '已封存舊方案',
        status: 'archived',
        booking_type: 'scheduled',
        base_price: 900,
      },
    ],
  },
};

const MOCK_ACTIVITY = {
  ok: true,
  data: {
    id: ACTIVITY_ID,
    title: '測試行程',
    slug: 'test-activity',
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

const MOCK_SCHEDULES = {
  ok: true,
  data: [],
};

/** Set up all required mocks for the activity edit page */
async function stubActivityEditPage(page: import('@playwright/test').Page) {
  // Mock activity fetch
  await page.route(`**/api/admin/activities/${ACTIVITY_ID}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ACTIVITY),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
  });

  // Mock schedules list
  await page.route(`**/api/admin/activities/${ACTIVITY_ID}/schedules`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SCHEDULES),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { schedule: {} } }),
      });
    }
  });

  // Mock guide search (may be called on load)
  await page.route('**/api/admin/guides**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });

  // Mock V2 plans
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PLANS),
    });
  });
}

test('T1130.1 - plan dropdown shows V2 plan names (not legacy half-day/full-day)', async ({
  authedPage: page,
}) => {
  await stubActivityEditPage(page);

  // Default V2 schedules POST mock (success)
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/schedules`, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { schedule: { id: 'new-schedule-1' } } }),
    });
  });

  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');

  // Wait for schedule section to load
  await page.waitForSelector('text=場次管理', { timeout: 10000 });

  // Click the add schedule button
  await page.locator('button:has-text("新增場次")').click();

  // Wait for modal to appear
  await page.waitForSelector('text=批次新增場次', { timeout: 5000 });

  // Check that the plan dropdown contains V2 plan names
  const select = page.locator('select').filter({ has: page.locator('option:has-text("早鳥半日探秘")') });
  await expect(select).toBeVisible();

  // Verify V2 names are shown
  await expect(page.locator('option:has-text("早鳥半日探秘")')).toBeAttached();
  await expect(page.locator('option:has-text("全日深度探秘")')).toBeAttached();

  // Verify legacy labels are NOT shown
  await expect(page.locator('option:has-text("A. 半日行程")')).not.toBeAttached();
  await expect(page.locator('option:has-text("B. 全日行程")')).not.toBeAttached();
});

test('T1130.2 - archived plan is excluded from the dropdown', async ({
  authedPage: page,
}) => {
  await stubActivityEditPage(page);

  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/schedules`, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { schedule: { id: 'new-schedule-1' } } }),
    });
  });

  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('text=場次管理', { timeout: 10000 });

  await page.locator('button:has-text("新增場次")').click();
  await page.waitForSelector('text=批次新增場次', { timeout: 5000 });

  // Archived plan should NOT appear in the dropdown
  await expect(page.locator('option:has-text("已封存舊方案")')).not.toBeAttached();
});

test('T1130.3 - schedule create POST hits /api/v2/ endpoint with UUID planId', async ({
  authedPage: page,
}) => {
  await stubActivityEditPage(page);

  let capturedBody: Record<string, unknown> | null = null;
  let capturedUrl = '';

  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/schedules`, async (route) => {
    capturedUrl = route.request().url();
    try {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      capturedBody = body;
    } catch {
      capturedBody = null;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { schedule: { id: 'new-schedule-v2' } } }),
    });
  });

  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('text=場次管理', { timeout: 10000 });

  await page.locator('button:has-text("新增場次")').click();
  await page.waitForSelector('text=批次新增場次', { timeout: 5000 });

  // Select the first active plan
  const planSelect = page.locator('label:has-text("適用方案") select');
  await planSelect.selectOption('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  // Select a date from the calendar grid (click first available day button)
  const dayButtons = page.locator('div').filter({ hasText: /^選擇日期/ }).locator('button[type="button"]').filter({ hasText: /\d+\/\d+/ });
  await dayButtons.first().click();

  // Submit the form
  await page.locator('button[type="submit"]').click();

  // Wait for the POST to be made
  await page.waitForResponse(
    (r) => r.url().includes('/api/v2/admin/activities/') && r.url().includes('/schedules'),
    { timeout: 10000 },
  );

  // Verify V2 endpoint was called (not legacy /api/admin/...)
  expect(capturedUrl).toContain('/api/v2/admin/activities/');
  expect(capturedUrl).not.toContain('/api/admin/activities/');

  // Verify the planId sent is a UUID (not legacy string like 'half-day')
  const body = capturedBody as Record<string, unknown> | null;
  expect(body?.['planId']).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
});

test('T1130.4 - 422 AMBIGUOUS_PLAN error message displayed in modal', async ({
  authedPage: page,
}) => {
  // Use a mock with only 1 active plan so blank planId is allowed in the UI
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SCHEDULES),
    });
  });

  await page.route('**/api/admin/guides**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });

  // Override plans: only 1 active plan so blank option is shown
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          activity: { id: ACTIVITY_ID, title: '測試行程' },
          plans: [
            {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
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

  // V2 schedules endpoint returns 422 AMBIGUOUS_PLAN
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/schedules`, async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: {
          code: 'AMBIGUOUS_PLAN',
          message: '此活動有多個有效方案，請明確指定 planId',
        },
      }),
    });
  });

  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('text=場次管理', { timeout: 10000 });

  await page.locator('button:has-text("新增場次")').click();
  await page.waitForSelector('text=批次新增場次', { timeout: 5000 });

  // Leave plan as blank and select a date
  const dayButtons = page.locator('div').filter({ hasText: /^選擇日期/ }).locator('button[type="button"]').filter({ hasText: /\d+\/\d+/ });
  await dayButtons.first().click();

  // Submit
  await page.locator('button[type="submit"]').click();

  // Wait for the response
  await page.waitForResponse(
    (r) => r.url().includes('/api/v2/admin/activities/') && r.url().includes('/schedules'),
    { timeout: 10000 },
  );

  // The zh-TW error message should appear in the modal error banner
  await expect(page.locator('body')).toContainText(
    '此活動有多個有效方案',
    { timeout: 5000 },
  );
});

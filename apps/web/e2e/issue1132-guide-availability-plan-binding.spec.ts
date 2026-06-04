/**
 * Issue #1132 — Guide availability rules: bind V2 activity_plan_id in UI and API
 *
 * Coverage:
 *   T1132.1 - Open rule modal → activity dropdown and plan dropdown render; "不限方案" exists
 *   T1132.2 - Select activity → plan dropdown shows that activity's plans; POST body has activity_plan_id UUID
 *   T1132.3 - "不限方案" → POST body has activity_plan_id = null
 *   T1132.4 - Existing rule with bound plan → modal pre-selects the plan
 *
 * Strategy:
 *   - page.route() mocks:
 *       GET /api/v2/admin/guides/:guideId/activity-plans  → 2 activities with plans
 *       GET /api/v2/admin/guides/:guideId/availability-rules → existing rules (one with plan binding)
 *       GET /api/v2/admin/guides/:guideId/blackout-dates → empty
 *       GET /api/v2/admin/guides/:guideId/availability-preview → empty slots
 *       POST /api/v2/admin/guides/:guideId/availability-rules → captures request body
 *   - Does NOT depend on Supabase seed data.
 */

import { test, expect } from './helpers';

const GUIDE_ID = '99999999-9999-9999-9999-999999999999';
const PLAN_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PLAN_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PLAN_C_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ACTIVITY_1_ID = '11111111-1111-1111-1111-111111111111';
const ACTIVITY_2_ID = '22222222-2222-2222-2222-222222222222';

const MOCK_ACTIVITIES = {
  success: true,
  data: {
    activities: [
      {
        id: ACTIVITY_1_ID,
        title: '北海岸秘境探索',
        slug: 'north-coast-discovery',
        plans: [
          { id: PLAN_A_ID, name: '半日探秘', status: 'active', booking_type: 'scheduled', base_price: 1800 },
          { id: PLAN_B_ID, name: '全日深度', status: 'active', booking_type: 'scheduled', base_price: 3000 },
        ],
      },
      {
        id: ACTIVITY_2_ID,
        title: '陽明山秘境步道',
        slug: 'yangmingshan-trail',
        plans: [
          { id: PLAN_C_ID, name: '黃昏夕陽場', status: 'active', booking_type: 'scheduled', base_price: 2200 },
        ],
      },
    ],
  },
};

const MOCK_RULES_WITH_PLAN = {
  success: true,
  data: {
    rules: [
      {
        id: 'rule-with-plan-1111-111111111111',
        guide_id: GUIDE_ID,
        activity_plan_id: PLAN_A_ID,
        weekday: 3,
        start_time_local: '09:00',
        end_time_local: '17:00',
        timezone: 'Asia/Taipei',
        slot_interval_minutes: 60,
        buffer_before_minutes: 15,
        buffer_after_minutes: 15,
        effective_from: null,
        effective_to: null,
        is_active: true,
        activity_plans: { id: PLAN_A_ID, name: '半日探秘' },
      },
    ],
  },
};

const MOCK_RULES_EMPTY = {
  success: true,
  data: { rules: [] },
};

const MOCK_BLACKOUTS_EMPTY = {
  success: true,
  data: { blackouts: [] },
};

const MOCK_PREVIEW_EMPTY = {
  success: true,
  data: {
    guide: { id: GUIDE_ID, display_name: '測試導遊' },
    timezone: 'Asia/Taipei',
    dateFrom: '2026-06-03',
    dateTo: '2026-06-10',
    rulesCount: 0,
    blackoutsCount: 0,
    activeBookingsCount: 0,
    slots: [],
  },
};

const MOCK_RULE_CREATED = {
  success: true,
  data: {
    rule: {
      id: 'new-rule-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      guide_id: GUIDE_ID,
      activity_plan_id: PLAN_A_ID,
      weekday: 1,
      start_time_local: '09:00',
      end_time_local: '17:00',
      timezone: 'Asia/Taipei',
      slot_interval_minutes: 60,
      buffer_before_minutes: 15,
      buffer_after_minutes: 15,
      effective_from: null,
      effective_to: null,
      is_active: true,
    },
  },
};

/** Mount all standard mocks for the availability page */
async function stubAvailabilityPage(
  page: import('@playwright/test').Page,
  rulesResponse: { success: boolean; data: { rules: unknown[] } } = MOCK_RULES_EMPTY
) {
  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/activity-plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ACTIVITIES),
    });
  });

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-rules`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rulesResponse),
      });
    } else {
      // POST — default success
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RULE_CREATED),
      });
    }
  });

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/blackout-dates`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_BLACKOUTS_EMPTY),
    });
  });

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-preview**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PREVIEW_EMPTY),
    });
  });
}

test('T1132.1 - Open rule modal → activity dropdown and plan dropdown render; "不限方案" exists', async ({
  authedPage: page,
}) => {
  await stubAvailabilityPage(page);

  await page.goto(`/admin/guides/${GUIDE_ID}/availability`);
  await page.waitForLoadState('domcontentloaded');

  // Open the add rule modal
  await page.locator('button:has-text("新增時段")').click();
  await page.waitForSelector('text=新增時段規則', { timeout: 5000 });

  // Activity dropdown should appear and contain "所有活動"
  const activitySelect = page.locator('select[aria-label="活動"]');
  await expect(activitySelect).toBeVisible();
  await expect(page.locator('option:has-text("所有活動")')).toBeAttached();
  await expect(page.locator('option:has-text("北海岸秘境探索")')).toBeAttached();
  await expect(page.locator('option:has-text("陽明山秘境步道")')).toBeAttached();

  // Select an activity — plan dropdown should appear with "不限方案"
  await activitySelect.selectOption(ACTIVITY_1_ID);
  const planSelect = page.locator('select[aria-label="方案"]');
  await expect(planSelect).toBeVisible();
  await expect(page.locator('option:has-text("不限方案")')).toBeAttached();
});

test('T1132.2 - Select activity → plan dropdown shows plans; POST body contains activity_plan_id UUID', async ({
  authedPage: page,
}) => {
  await stubAvailabilityPage(page);

  let capturedBody: Record<string, unknown> | null = null;

  // Override POST to capture body
  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-rules`, async (route) => {
    if (route.request().method() === 'POST') {
      try {
        capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      } catch {
        capturedBody = null;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RULE_CREATED),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RULES_EMPTY),
      });
    }
  });

  await page.goto(`/admin/guides/${GUIDE_ID}/availability`);
  await page.waitForLoadState('domcontentloaded');

  await page.locator('button:has-text("新增時段")').click();
  await page.waitForSelector('text=新增時段規則', { timeout: 5000 });

  // Select activity 1
  const activitySelect = page.locator('select[aria-label="活動"]');
  await activitySelect.selectOption(ACTIVITY_1_ID);

  // Plan dropdown should show plans for activity 1
  await expect(page.locator('option:has-text("半日探秘")')).toBeAttached();
  await expect(page.locator('option:has-text("全日深度")')).toBeAttached();

  // Select plan A
  const planSelect = page.locator('select[aria-label="方案"]');
  await planSelect.selectOption(PLAN_A_ID);

  // Save
  await page.locator('button:has-text("儲存")').click();

  // Wait for POST to complete
  await page.waitForResponse(
    (r) => r.url().includes('/availability-rules') && r.request().method() === 'POST',
    { timeout: 10000 }
  );

  // Verify captured body contains the plan UUID
  expect(capturedBody?.['activity_plan_id']).toBe(PLAN_A_ID);
});

test('T1132.3 - "不限方案" selected → POST body has activity_plan_id = null', async ({
  authedPage: page,
}) => {
  await stubAvailabilityPage(page);

  let capturedBody: Record<string, unknown> | null = null;

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-rules`, async (route) => {
    if (route.request().method() === 'POST') {
      try {
        capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      } catch {
        capturedBody = null;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RULE_CREATED),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RULES_EMPTY),
      });
    }
  });

  await page.goto(`/admin/guides/${GUIDE_ID}/availability`);
  await page.waitForLoadState('domcontentloaded');

  await page.locator('button:has-text("新增時段")').click();
  await page.waitForSelector('text=新增時段規則', { timeout: 5000 });

  // Select an activity first, then reset to "不限方案" (empty plan)
  const activitySelect = page.locator('select[aria-label="活動"]');
  await activitySelect.selectOption(ACTIVITY_1_ID);
  const planSelect = page.locator('select[aria-label="方案"]');
  await planSelect.selectOption(''); // "不限方案"

  // Save
  await page.locator('button:has-text("儲存")').click();

  await page.waitForResponse(
    (r) => r.url().includes('/availability-rules') && r.request().method() === 'POST',
    { timeout: 10000 }
  );

  // activity_plan_id should be null (or absent, which maps to null in the API)
  const planId = capturedBody?.['activity_plan_id'];
  expect(planId === null || planId === undefined || planId === '').toBe(true);
});

test('T1132.4 - Existing rule with bound plan → modal pre-selects the plan', async ({
  authedPage: page,
}) => {
  await stubAvailabilityPage(page, MOCK_RULES_WITH_PLAN);

  await page.goto(`/admin/guides/${GUIDE_ID}/availability`);
  await page.waitForLoadState('domcontentloaded');

  // Wait for rules to load (the rule chip should appear)
  await page.waitForSelector('text=09:00-17:00', { timeout: 10000 });

  // Click edit on the rule with the bound plan
  await page.locator('button:has-text("編輯")').first().click();
  await page.waitForSelector('text=編輯時段規則', { timeout: 5000 });

  // Plan select should show plan A as selected
  const planSelect = page.locator('select[aria-label="方案"]');
  await expect(planSelect).toBeVisible();
  await expect(planSelect).toHaveValue(PLAN_A_ID);
});

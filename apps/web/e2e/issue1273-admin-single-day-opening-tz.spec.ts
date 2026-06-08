import { test, expect } from './helpers';

/**
 * Issue #1273 — Browser E2E for GH-1257 slice F (PR #1271):
 * Admin single-day availability opening, verified under a NON-Taiwan browser
 * timezone (regression guard for the TZ-safe weekday derivation).
 *
 * Why the timezone matters:
 *   The chosen single date is converted to a weekday for the availability
 *   resolver. A naive `new Date('2030-04-12').getDay()` parses as UTC midnight,
 *   which in America/Los_Angeles (UTC-7 in April) rolls back to 2030-04-11 →
 *   Thursday (4). #1271 anchors at noon Asia/Taipei so the weekday is the real
 *   Taiwan weekday — Friday (5) — in any browser timezone. This spec runs the
 *   whole flow with the context forced to America/Los_Angeles and asserts the
 *   POST carries weekday 5, so exactly 2030-04-12 becomes bookable.
 *
 * Strategy: page.route() mocks all data APIs (no Supabase seed); the POST body
 * is captured to assert the TZ-safe weekday + single-date effective range.
 */

test.describe.configure({ timeout: 90_000 });
test.use({ timezoneId: 'America/Los_Angeles' });

const GUIDE_ID = '66666666-6666-4666-8666-666666666666';
const ACTIVITY_ID = '77777777-7777-4777-8777-777777777777';
const PLAN_ID = '88888888-8888-4888-8888-888888888888';
const GUIDE_NAME = '林海風';
const ACTIVITY_TITLE = '海岸獨木舟';
const PLAN_NAME = '日出場';
const SINGLE_DATE = '2030-04-12'; // Friday in Asia/Taipei → weekday 5
const EXPECTED_WEEKDAY = 5;

async function stubAvailabilityPage(page: import('@playwright/test').Page) {
  const rulePosts: Array<Record<string, unknown>> = [];
  let ruleCreated = false;

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/activity-plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          activities: [
            {
              id: ACTIVITY_ID,
              title: ACTIVITY_TITLE,
              slug: 'coast-kayak',
              plans: [
                {
                  id: PLAN_ID,
                  name: PLAN_NAME,
                  status: 'active',
                  booking_type: 'scheduled',
                  base_price: 2600,
                  isYearRound: true,
                  activeSeasonSummaries: [],
                },
              ],
            },
          ],
        },
      }),
    });
  });

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-rules`, async (route) => {
    if (route.request().method() === 'POST') {
      rulePosts.push(route.request().postDataJSON() as Record<string, unknown>);
      ruleCreated = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { rule: { id: 'rule-single-1' } } }),
      });
      return;
    }
    // GET — reflect the created single-day rule so the list echoes 單日：<date>.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          rules: ruleCreated
            ? [
                {
                  id: 'rule-single-1',
                  guide_id: GUIDE_ID,
                  weekday: EXPECTED_WEEKDAY,
                  start_time_local: '09:00',
                  end_time_local: '17:00',
                  timezone: 'Asia/Taipei',
                  slot_interval_minutes: 60,
                  buffer_before_minutes: 15,
                  buffer_after_minutes: 15,
                  effective_from: SINGLE_DATE,
                  effective_to: SINGLE_DATE,
                  is_active: true,
                  activity_plan_id: PLAN_ID,
                  activity_plans: { name: PLAN_NAME },
                },
              ]
            : [],
        },
      }),
    });
  });

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/blackout-dates`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { blackouts: [] } }),
    });
  });

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-preview**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          guide: { id: GUIDE_ID, display_name: GUIDE_NAME },
          timezone: 'Asia/Taipei',
          dateFrom: SINGLE_DATE,
          dateTo: SINGLE_DATE,
          activityPlanId: PLAN_ID,
          previewCanonicalState: ruleCreated ? 'available' : 'no_rule',
          previewSeasonGate: 'explicit_year_round',
          isYearRound: true,
          activeSeasonSummaries: [],
          rulesCount: ruleCreated ? 1 : 0,
          blackoutsCount: 0,
          activeBookingsCount: 0,
          slots: ruleCreated
            ? [{ startAt: `${SINGLE_DATE}T09:00:00+08:00`, endAt: `${SINGLE_DATE}T10:00:00+08:00`, isAvailable: true }]
            : [],
        },
      }),
    });
  });

  return { rulePosts };
}

test('GH-1257 slice F: admin single-day opening derives Taiwan weekday under a Los Angeles browser timezone', async ({
  authedPage: page,
}) => {
  const api = await stubAvailabilityPage(page);

  await page.goto(`/admin/guides/${GUIDE_ID}/availability`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: '導遊時間管理' })).toBeVisible();

  await page.getByRole('button', { name: '+ 新增時段' }).click();
  // Scope all interactions to the modal so the rule-form selects never collide
  // with the preview panel's 預覽方案篩選 / activity filters.
  const dialog = page.getByRole('dialog', { name: '新增時段規則' });
  await expect(dialog).toBeVisible();

  // Bind the rule to an activity + plan.
  await dialog.getByLabel('活動').selectOption(ACTIVITY_ID);
  await dialog.getByLabel('方案').selectOption(PLAN_ID);

  // Switch to single-day mode and pick the date (台灣時間).
  await dialog.getByText('單日開放', { exact: true }).click();
  const dateInput = dialog.locator('#admin-avail-single-date');
  await expect(dateInput).toBeVisible();
  await dateInput.fill(SINGLE_DATE);
  // The weekday <select> is disabled in single-day mode (derived from the date).
  await expect(dialog.getByLabel('星期')).toBeDisabled();

  await dialog.getByRole('button', { name: '儲存' }).click();

  // POST contract: weekday is the Taiwan weekday (5/Fri), NOT the LA-shifted 4/Thu.
  await expect.poll(() => api.rulePosts.length).toBe(1);
  const body = api.rulePosts[0];
  expect(body.weekday).toBe(EXPECTED_WEEKDAY);
  expect(body.effective_from).toBe(SINGLE_DATE);
  expect(body.effective_to).toBe(SINGLE_DATE);
  expect(body.activity_plan_id).toBe(PLAN_ID);
  // Mode-only UI fields are stripped before submit.
  expect(body.rule_mode).toBeUndefined();
  expect(body.single_date).toBeUndefined();

  // The rule list echoes the exact single day that is now bookable.
  await expect(page.getByText(`單日：${SINGLE_DATE}`)).toBeVisible();
});

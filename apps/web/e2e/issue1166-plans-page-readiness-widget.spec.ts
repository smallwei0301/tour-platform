/**
 * Issue #1166 — Admin/Plans: Display readiness gate warnings widget on activity plans page
 *
 * Coverage:
 *   T1166.1 - Shows green ✅ banner when readiness returns ok: true (no warnings)
 *   T1166.2 - Shows amber ⚠️ banner with blocker list when readiness returns blockers
 *   T1166.3 - Shows yellow ℹ️ banner when readiness ok but has warnings
 *   T1166.4 - Shows loading state while API has not yet responded
 *
 * Strategy:
 *   - Use page.route() to mock GET /api/v2/admin/activities/:id/readiness and
 *     GET /api/v2/admin/activities/:id/plans so test does not depend on Supabase seed.
 *   - Admin page loaded via the `authedPage` fixture from helpers.ts.
 */
import { test, expect } from './helpers';

const ACTIVITY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/** Minimal stub for the plans endpoint so the page renders without error. */
async function stubPlansAPI(page: import('@playwright/test').Page) {
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          activity: { id: ACTIVITY_ID, title: '測試行程 1166' },
          plans: [],
        },
      }),
    });
  });
}

/** Stub the readiness endpoint with a given payload. */
async function stubReadiness(
  page: import('@playwright/test').Page,
  payload: object,
) {
  await page.route(
    `**/api/v2/admin/activities/${ACTIVITY_ID}/readiness`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: payload }),
      });
    },
  );
}

test('T1166.1 — Shows green ✅ ready banner when readiness ok with no warnings', async ({
  authedPage: page,
}) => {
  await stubPlansAPI(page);
  await stubReadiness(page, {
    activityId: ACTIVITY_ID,
    readinessOk: true,
    blockers: [],
    warnings: [],
    summary: {
      activePlansCount: 2,
      futureSchedulesCount: 5,
      openSchedulesWithNullPlan: 0,
    },
    computedAt: new Date().toISOString(),
  });

  await page.goto(`/admin/activities/${ACTIVITY_ID}/plans`);

  // Wait for readiness widget to appear
  const banner = page.getByTestId('readiness-ok');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText('✅');
  await expect(banner).toContainText('符合發佈條件');
  await expect(banner).toContainText('2 個啟用方案');
  await expect(banner).toContainText('5 個未來場次');
});

test('T1166.2 — Shows amber ⚠️ blockers banner when readiness returns blockers', async ({
  authedPage: page,
}) => {
  await stubPlansAPI(page);
  await stubReadiness(page, {
    activityId: ACTIVITY_ID,
    readinessOk: false,
    blockers: [
      { code: 'NO_ACTIVE_PLANS', messageZh: '尚無啟用方案' },
      { code: 'NO_FUTURE_SCHEDULES', messageZh: '沒有未來場次' },
    ],
    warnings: [],
    summary: {
      activePlansCount: 0,
      futureSchedulesCount: 0,
      openSchedulesWithNullPlan: 0,
    },
    computedAt: new Date().toISOString(),
  });

  await page.goto(`/admin/activities/${ACTIVITY_ID}/plans`);

  const banner = page.getByTestId('readiness-blockers');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText('⚠️');
  await expect(banner).toContainText('尚未符合發佈條件');
  await expect(banner).toContainText('2 個問題');
  await expect(banner).toContainText('尚無啟用方案');
  await expect(banner).toContainText('沒有未來場次');

  // Green ok banner must NOT appear
  await expect(page.getByTestId('readiness-ok')).not.toBeVisible();
});

test('T1166.3 — Shows yellow ℹ️ warnings banner when readiness ok but has warnings', async ({
  authedPage: page,
}) => {
  await stubPlansAPI(page);
  await stubReadiness(page, {
    activityId: ACTIVITY_ID,
    readinessOk: true,
    blockers: [],
    warnings: ['有 3 個開放場次未綁定方案，建議確認'],
    summary: {
      activePlansCount: 1,
      futureSchedulesCount: 3,
      openSchedulesWithNullPlan: 3,
    },
    computedAt: new Date().toISOString(),
  });

  await page.goto(`/admin/activities/${ACTIVITY_ID}/plans`);

  const banner = page.getByTestId('readiness-warnings');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText('ℹ️');
  await expect(banner).toContainText('非阻擋警告');
  await expect(banner).toContainText('有 3 個開放場次未綁定方案');

  // Blocker and ok banners must NOT appear
  await expect(page.getByTestId('readiness-blockers')).not.toBeVisible();
  await expect(page.getByTestId('readiness-ok')).not.toBeVisible();
});

test('T1166.4 — Shows loading state while readiness API is pending', async ({
  authedPage: page,
}) => {
  await stubPlansAPI(page);

  // Delay the readiness response long enough to observe the loading state
  let resolveReadiness!: () => void;
  const readinessGate = new Promise<void>((res) => {
    resolveReadiness = res;
  });

  await page.route(
    `**/api/v2/admin/activities/${ACTIVITY_ID}/readiness`,
    async (route) => {
      await readinessGate; // Hold the response until we're ready
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            activityId: ACTIVITY_ID,
            readinessOk: true,
            blockers: [],
            warnings: [],
            summary: { activePlansCount: 1, futureSchedulesCount: 2, openSchedulesWithNullPlan: 0 },
            computedAt: new Date().toISOString(),
          },
        }),
      });
    },
  );

  await page.goto(`/admin/activities/${ACTIVITY_ID}/plans`);

  // The loading text should be visible while the API is still pending
  await expect(page.locator('body')).toContainText('檢查發佈資格中', { timeout: 10_000 });

  // Release the API response
  resolveReadiness();

  // After response, the loading text should disappear and the ok banner should appear
  await expect(page.getByTestId('readiness-ok')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('body')).not.toContainText('檢查發佈資格中');
});

import { test, expect } from './helpers';

test.describe.configure({ timeout: 90_000 });

type PreviewSlot = {
  startAt: string;
  endAt: string;
  isAvailable: boolean;
  canonicalState?: string;
  conflictOverride?: {
    id: string;
    reason: string;
    requiresHelper: boolean;
    helperStatus: string;
    guideNote?: string | null;
    adminNote?: string | null;
    createdAt?: string | null;
    createdByAdminEmail?: string | null;
  } | null;
};

const GUIDE_ID = '11111111-1111-4111-8111-111111111111';
const ACTIVITY_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const SLOT_START = '2030-04-12T09:00:00+08:00';
const SLOT_END = '2030-04-12T12:00:00+08:00';
const GUIDE_NAME = '王小導';
const ACTIVITY_TITLE = '衝浪體驗';
const PLAN_NAME = '晨間包場';

function blockedSlot(): PreviewSlot {
  return {
    startAt: SLOT_START,
    endAt: SLOT_END,
    isAvailable: false,
    canonicalState: 'blocked_by_conflict',
    conflictOverride: null,
  };
}

function overriddenSlot(): PreviewSlot {
  return {
    startAt: SLOT_START,
    endAt: SLOT_END,
    isAvailable: true,
    canonicalState: 'allowed_with_admin_override',
    conflictOverride: {
      id: 'override-1',
      reason: 'VIP 客訴補救',
      requiresHelper: true,
      helperStatus: 'required',
      guideNote: '導遊已知悉',
      adminNote: '後台核准',
      createdAt: '2030-04-10T08:00:00+08:00',
      createdByAdminEmail: 'admin@example.com',
    },
  };
}

async function stubGuideAvailabilityPage(page: import('@playwright/test').Page) {
  let overrideCreated = false;
  const conflictOverridePosts: Array<Record<string, unknown>> = [];
  const conflictOverrideHeaders: Array<Record<string, string>> = [];

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-rules`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { rules: [] } }),
    });
  });

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/blackout-dates`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { blackouts: [] } }),
    });
  });

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
              slug: 'surfing-exp',
              plans: [
                {
                  id: PLAN_ID,
                  name: PLAN_NAME,
                  status: 'active',
                  booking_type: 'scheduled',
                  base_price: 3200,
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

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-preview**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          guide: { id: GUIDE_ID, display_name: GUIDE_NAME },
          timezone: 'Asia/Taipei',
          dateFrom: '2030-04-12',
          dateTo: '2030-04-12',
          activityPlanId: PLAN_ID,
          previewCanonicalState: overrideCreated ? 'allowed_with_admin_override' : 'blocked_by_conflict',
          previewSeasonGate: 'explicit_year_round',
          isYearRound: true,
          activeSeasonSummaries: [],
          rulesCount: 0,
          blackoutsCount: 0,
          activeBookingsCount: 1,
          slots: [overrideCreated ? overriddenSlot() : blockedSlot()],
        },
      }),
    });
  });

  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/conflict-overrides`, async (route) => {
    const request = route.request();
    conflictOverridePosts.push(request.postDataJSON() as Record<string, unknown>);
    conflictOverrideHeaders.push(request.headers());
    overrideCreated = true;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          override: overriddenSlot().conflictOverride,
          duplicate: false,
        },
      }),
    });
  });

  return {
    conflictOverridePosts,
    conflictOverrideHeaders,
  };
}

async function stubActivityEditPage(page: import('@playwright/test').Page) {
  await page.route(`**/api/admin/activities/${ACTIVITY_ID}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            id: ACTIVITY_ID,
            title: ACTIVITY_TITLE,
            slug: 'surfing-exp',
            guideSlug: 'guide-wang',
            region: '台北市',
            category: 'outdoor',
            priceTwd: 3200,
            durationMinutes: 180,
            minParticipants: 1,
            maxParticipants: 8,
            meetingPoint: '集合點',
            meetingPointMapUrl: '',
            coverImageUrl: '',
            imageUrls: [],
            description: '描述',
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
        }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.route(`**/api/admin/activities/${ACTIVITY_ID}/schedules`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { schedule: {} } }),
    });
  });

  await page.route('**/api/admin/guides**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });

  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          activity: { id: ACTIVITY_ID, title: ACTIVITY_TITLE },
          plans: [
            {
              id: PLAN_ID,
              name: PLAN_NAME,
              status: 'active',
              booking_type: 'scheduled',
              base_price: 3200,
              min_participants: 2,
              max_participants: 8,
              duration_minutes: 180,
            },
          ],
        },
      }),
    });
  });
}

test('GH-1257 RED: blocked conflict slot exposes exception modal, validates required reason, submits helper metadata, then refreshes to allowed_with_admin_override', async ({
  authedPage: page,
}) => {
  const api = await stubGuideAvailabilityPage(page);

  await page.goto(`/admin/guides/${GUIDE_ID}/availability`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: '導遊時間管理' })).toBeVisible();

  // The 例外開放此場 CTA only renders for a blocked slot once a preview plan is
  // selected (it needs previewPlanId/previewActivity/previewPlan to build the
  // override payload). The original spec was authored before #1273 ran it in a
  // real browser, so this required step was missing.
  await page.getByLabel('預覽方案篩選').selectOption(PLAN_ID);

  await expect(page.getByText('既有衝突')).toBeVisible();
  await expect(page.getByRole('button', { name: '例外開放此場' })).toBeVisible();

  await page.getByRole('button', { name: '例外開放此場' }).click();

  // Scope to the dialog: guide/activity/plan names and 需要助手 also appear in
  // the page header + preview slot card, so unscoped getByText is ambiguous.
  const dialog = page.getByRole('dialog', { name: '例外開放衝突時段' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(GUIDE_NAME)).toBeVisible();
  await expect(dialog.getByText(ACTIVITY_TITLE)).toBeVisible();
  await expect(dialog.getByText(PLAN_NAME)).toBeVisible();
  await expect(dialog.getByText('這不是一般新增場次')).toBeVisible();
  await expect(dialog.getByLabel('例外開放原因')).toBeVisible();
  await expect(dialog.getByLabel('需要助手')).toBeVisible();
  await expect(dialog.getByLabel('助手狀態')).toBeVisible();
  await expect(dialog.getByLabel('導遊可見備註')).toBeVisible();
  await expect(dialog.getByLabel('內部管理備註')).toBeVisible();

  await dialog.getByRole('button', { name: '確認例外開放' }).click();
  await expect(dialog.getByText('請先填寫例外開放原因')).toBeVisible();
  expect(api.conflictOverridePosts).toHaveLength(0);

  await dialog.getByLabel('例外開放原因').fill('VIP 客訴補救');
  await dialog.getByLabel('需要助手').check();
  await dialog.getByLabel('助手狀態').selectOption('required');
  await dialog.getByLabel('導遊可見備註').fill('導遊已知悉');
  await dialog.getByLabel('內部管理備註').fill('後台核准');
  await dialog.getByRole('button', { name: '確認例外開放' }).click();

  await expect.poll(() => api.conflictOverridePosts.length).toBe(1);
  expect(api.conflictOverridePosts[0]).toMatchObject({
    activityId: ACTIVITY_ID,
    activityPlanId: PLAN_ID,
    startAt: SLOT_START,
    endAt: SLOT_END,
    reason: 'VIP 客訴補救',
    requiresHelper: true,
    helperStatus: 'required',
    guideNote: '導遊已知悉',
    adminNote: '後台核准',
  });
  expect(api.conflictOverrideHeaders[0]['x-csrf-token']).toBeTruthy();

  await expect(page.getByText('管理員覆寫後可開放')).toBeVisible();
  await expect(page.getByText('VIP 客訴補救')).toBeVisible();
  await expect(page.getByText('需要助手')).toBeVisible();
});

test('GH-1257 RED: add-schedule helper copy says normal schedule creation does not bypass guide/resource conflicts and points to exception flow', async ({
  authedPage: page,
}) => {
  await stubActivityEditPage(page);

  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('text=場次管理', { timeout: 10000 });
  await page.getByRole('button', { name: '新增場次' }).click();

  const helper = page.getByTestId('admin-availability-precedence-helper');
  await expect(helper).toBeVisible();
  await expect(helper).toContainText('activity_schedules 與指定日期場次不會略過導遊／資源衝突');
  await expect(helper).toContainText('如遇既有預約衝突，請改到導遊時間管理預覽後使用「例外開放此場」');
  await expect(helper).not.toContainText('新增場次就能直接覆蓋衝突');
});

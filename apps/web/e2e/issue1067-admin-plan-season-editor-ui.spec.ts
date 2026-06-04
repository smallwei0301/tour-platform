import { test, expect } from './helpers';

type Season = {
  id: string;
  name: string;
  start_month: number;
  start_day: number;
  end_month: number;
  end_day: number;
  timezone: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const SEASON_ID = '33333333-3333-4333-8333-333333333333';

const activityPayload = {
  id: ACTIVITY_ID,
  title: '野溪探洞體驗',
};

const plansPayload = [
  {
    id: PLAN_ID,
    activity_id: ACTIVITY_ID,
    name: '標準方案',
    slug: 'standard-plan',
    description: '適合第一次參加的旅客',
    duration_minutes: 180,
    price_type: 'per_person',
    base_price: 3600,
    min_participants: 2,
    max_participants: 8,
    booking_type: 'scheduled',
    status: 'active',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  },
];

async function stubReadiness(page: import('@playwright/test').Page) {
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/readiness`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          readinessOk: true,
          blockers: [],
          warnings: [],
          summary: {
            activePlansCount: 1,
            futureSchedulesCount: 3,
            openSchedulesWithNullPlan: 0,
          },
        },
      }),
    });
  });
}

async function stubPlans(page: import('@playwright/test').Page) {
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          activity: activityPayload,
          plans: plansPayload,
        },
      }),
    });
  });
}

async function mountPage(page: import('@playwright/test').Page) {
  await stubReadiness(page);
  await stubPlans(page);
  await page.goto(`/admin/activities/${ACTIVITY_ID}/plans`);
}

test('GH-1067 RED: admin can open 開放季節 management and see existing season rows in Traditional Chinese', async ({
  authedPage: page,
}) => {
  const seasons: Season[] = [
    {
      id: SEASON_ID,
      name: '探洞季',
      start_month: 11,
      start_day: 1,
      end_month: 4,
      end_day: 30,
      timezone: 'Asia/Taipei',
      is_active: true,
      created_at: '2026-06-02T00:00:00.000Z',
      updated_at: '2026-06-02T00:00:00.000Z',
    },
  ];

  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans/${PLAN_ID}/seasons`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { seasons } }),
    });
  });

  await mountPage(page);

  await expect(page.getByRole('button', { name: '開放季節' })).toBeVisible();
  await page.getByRole('button', { name: '開放季節' }).click();

  await expect(page.getByText('探洞季')).toBeVisible();
  await expect(page.getByText('11/1 - 4/30')).toBeVisible();
  await expect(page.getByText('Asia/Taipei')).toBeVisible();
  await expect(page.getByText('啟用中')).toBeVisible();
});

test('GH-1067 RED: admin can create a season window with CSRF header and refreshed list', async ({
  authedPage: page,
}) => {
  const requestBodies: unknown[] = [];
  const requestHeaders: Array<Record<string, string>> = [];
  let seasons: Season[] = [];

  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans/${PLAN_ID}/seasons`, async (route) => {
    const request = route.request();

    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { seasons } }),
      });
      return;
    }

    const body = request.postDataJSON() as Record<string, unknown>;
    requestBodies.push(body);
    requestHeaders.push(request.headers());
    const createdSeason: Season = {
      id: SEASON_ID,
      name: String(body.name),
      start_month: Number(body.start_month),
      start_day: Number(body.start_day),
      end_month: Number(body.end_month),
      end_day: Number(body.end_day),
      timezone: String(body.timezone),
      is_active: true,
      created_at: '2026-06-03T00:00:00.000Z',
      updated_at: '2026-06-03T00:00:00.000Z',
    };
    seasons = [createdSeason];

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { season: createdSeason } }),
    });
  });

  await mountPage(page);

  await page.getByRole('button', { name: '開放季節' }).click();
  await page.getByRole('button', { name: '新增季節' }).click();
  await page.getByLabel('季節名稱').fill('探洞季');
  await page.getByLabel('開始月份').fill('11');
  await page.getByLabel('開始日期').fill('1');
  await page.getByLabel('結束月份').fill('4');
  await page.getByLabel('結束日期').fill('30');
  await page.getByLabel('時區').fill('Asia/Taipei');
  await page.getByRole('button', { name: '儲存季節' }).click();

  await expect(page.getByText('探洞季')).toBeVisible();
  await expect(page.getByText('11/1 - 4/30')).toBeVisible();
  await expect(requestBodies).toHaveLength(1);
  expect(requestBodies[0]).toMatchObject({
    name: '探洞季',
    start_month: 11,
    start_day: 1,
    end_month: 4,
    end_day: 30,
    timezone: 'Asia/Taipei',
  });
  expect(requestHeaders[0]['x-csrf-token']).toBeTruthy();
});

test('GH-1067 RED: plan with no active seasons warns that 全年開放 persistence is still pending and keeps prior rows on API error', async ({
  authedPage: page,
}) => {
  const inactiveSeason: Season = {
    id: SEASON_ID,
    name: '舊季節',
    start_month: 5,
    start_day: 1,
    end_month: 8,
    end_day: 31,
    timezone: 'Asia/Taipei',
    is_active: false,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  };

  let firstCreateAttempt = true;

  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans/${PLAN_ID}/seasons`, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { seasons: [inactiveSeason] } }),
      });
      return;
    }

    if (firstCreateAttempt) {
      firstCreateAttempt = false;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { message: 'Invalid month/day bounds' } }),
      });
      return;
    }

    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: { message: 'unexpected' } }),
    });
  });

  await mountPage(page);

  await page.getByRole('button', { name: '開放季節' }).click();
  await expect(page.getByText('請先設定指定季節')).toBeVisible();
  await expect(page.getByText('「全年開放」資料持久化仍在另一個資料契約切片處理中')).toBeVisible();
  await expect(page.getByText('舊季節')).toBeVisible();

  await page.getByRole('button', { name: '新增季節' }).click();
  await page.getByLabel('季節名稱').fill('錯誤季節');
  await page.getByLabel('開始月份').fill('2');
  await page.getByLabel('開始日期').fill('31');
  await page.getByLabel('結束月份').fill('3');
  await page.getByLabel('結束日期').fill('5');
  await page.getByRole('button', { name: '儲存季節' }).click();

  await expect(page.getByText('Invalid month/day bounds')).toBeVisible();
  await expect(page.getByText('舊季節')).toBeVisible();
});

test('GH-1067 RED: admin can disable a season without deleting the plan', async ({ authedPage: page }) => {
  let seasons: Season[] = [
    {
      id: SEASON_ID,
      name: '探洞季',
      start_month: 11,
      start_day: 1,
      end_month: 4,
      end_day: 30,
      timezone: 'Asia/Taipei',
      is_active: true,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
  ];
  let deleteCalls = 0;

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans/${PLAN_ID}/seasons`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { seasons } }),
    });
  });

  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans/${PLAN_ID}/seasons/${SEASON_ID}`, async (route) => {
    deleteCalls += 1;
    seasons = seasons.map((season) =>
      season.id === SEASON_ID ? { ...season, is_active: false, updated_at: '2026-06-05T00:00:00.000Z' } : season,
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { season: seasons[0] } }),
    });
  });

  await mountPage(page);

  await page.getByRole('button', { name: '開放季節' }).click();
  await page.getByRole('button', { name: '停用季節' }).click();

  await expect(page.getByText('已停用')).toBeVisible();
  expect(deleteCalls).toBe(1);
  await expect(page.getByText('標準方案')).toBeVisible();
});

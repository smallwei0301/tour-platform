import { test, expect, setGuideSession } from './helpers';

/**
 * Phase 2.5：站點時間表（隨方案送審）+ 季節供應（即時生效）E2E。
 * backend 全程 page.route mock。
 */

const GUIDE_ID = '11111111-1111-1111-1111-111111111111';
const ACTIVITY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PLAN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function mockGuideCsrf(page: import('@playwright/test').Page) {
  return page.route('**/api/guide/auth/csrf**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { token: 'e2e' } }) })
  );
}

function planBody(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      id: PLAN_ID, name: '賞鯨升級方案', description: '', price_type: 'per_person', base_price: 2200,
      duration_minutes: 240, min_participants: 1, max_participants: 10, booking_type: 'scheduled',
      highlights: [], plan_inclusions: [], plan_exclusions: [], plan_notices: [], plan_refund_rules: [],
      plan_itinerary: [], status: 'active', reviewState: null, reviewAdminNote: null, isNewPlan: false,
      ...extra,
    },
  };
}

test.describe('站點時間表（走方案審核）', () => {
  test('新增站點並送審，PUT 帶 plan_itinerary', async ({ page }) => {
    await setGuideSession(page, GUIDE_ID);
    await mockGuideCsrf(page);

    let putBody: any = null;
    await page.route(`**/api/guide/activities/${ACTIVITY_ID}/plans/${PLAN_ID}`, async (route) => {
      if (route.request().method() === 'PUT') {
        putBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(planBody()) });
    });
    await page.route(`**/api/guide/activities/${ACTIVITY_ID}/plans/${PLAN_ID}/submit`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { submitted: true } }) })
    );

    await page.goto(`/guide/activities/${ACTIVITY_ID}/plans/${PLAN_ID}`);
    await expect(page.getByText('站點時間表')).toBeVisible();
    await page.getByRole('button', { name: '＋ 新增站點' }).click();
    await page.getByPlaceholder('站名（例：烏石港集合）').fill('烏石港集合');
    await page.getByPlaceholder('站點說明').fill('集合後登船');

    await page.getByRole('button', { name: '送出審核' }).click();
    await expect(page.getByText('已送出審核，請等待管理者核准上架。')).toBeVisible();
    expect(putBody?.plan_itinerary?.[0]?.title).toBe('烏石港集合');
  });
});

test.describe('季節供應（即時生效）', () => {
  test('新增季節窗口與切換全年供應，皆即時呼叫對應 API', async ({ page }) => {
    await setGuideSession(page, GUIDE_ID);
    await mockGuideCsrf(page);

    let posted = false;
    let yearRoundPut: any = null;
    const seasonsBase = `**/api/guide/activities/${ACTIVITY_ID}/plans/${PLAN_ID}/seasons`;
    await page.route(seasonsBase, async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        posted = true;
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { season: { id: 'ssss', name: '賞鯨季', start_month: 4, start_day: 1, end_month: 10, end_day: 31 } } }) });
      }
      if (method === 'PUT') {
        yearRoundPut = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { isYearRound: true } }) });
      }
      // GET
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { isYearRound: false, seasons: [] } }) });
    });

    await page.goto(`/guide/activities/${ACTIVITY_ID}/plans/${PLAN_ID}/seasons`);
    await expect(page.getByRole('heading', { name: '季節供應' })).toBeVisible();
    await expect(page.getByText(/即時生效、不需審核/)).toBeVisible();

    // 新增季節窗口（即時）
    await page.getByPlaceholder('例：賞鯨季').fill('賞鯨季');
    await page.getByRole('button', { name: '新增' }).click();
    await expect(page.getByText('已新增季節窗口（即時生效）')).toBeVisible();
    expect(posted).toBe(true);

    // 切換全年供應（即時）
    await page.getByRole('switch').click();
    await expect(page.getByText('已更新（即時生效）')).toBeVisible();
    expect(yearRoundPut?.isYearRound).toBe(true);
  });
});

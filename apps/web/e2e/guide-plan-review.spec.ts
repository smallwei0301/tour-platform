import { test, expect, setGuideSession, adminLogin } from './helpers';

/**
 * Phase 2：導遊方案（含每方案價格）自助編輯／新建 + 管理者審核上架 E2E。
 * backend 全程 page.route mock（導遊 HMAC 假簽章不過 verifyGuideSession，故 mock /api/guide/**）。
 */

const GUIDE_ID = '11111111-1111-1111-1111-111111111111';
const ACTIVITY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PLAN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function mockGuideCsrf(page: import('@playwright/test').Page) {
  return page.route('**/api/guide/auth/csrf**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { token: 'e2e' } }) })
  );
}

test.describe('導遊方案編輯與送審', () => {
  test('方案列表顯示審核狀態徽章', async ({ page }) => {
    await setGuideSession(page, GUIDE_ID);
    await mockGuideCsrf(page);
    await page.route(`**/api/guide/activities/${ACTIVITY_ID}/plans`, (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: [
            { id: PLAN_ID, name: '賞鯨升級方案', base_price: 2200, price_type: 'per_person', duration_minutes: 240, status: 'active', reviewState: 'pending', reviewAdminNote: null, isNewPlan: false, hasPendingChanges: true },
            { id: 'cccc', name: '退回的方案', base_price: 999, price_type: 'per_group', duration_minutes: 120, status: 'inactive', reviewState: 'changes_requested', reviewAdminNote: '價格請調整', isNewPlan: true, hasPendingChanges: true },
          ],
        }),
      })
    );

    await page.goto(`/guide/activities/${ACTIVITY_ID}/plans`);
    await expect(page.getByRole('heading', { name: '方案管理' })).toBeVisible();
    await expect(page.getByText('賞鯨升級方案')).toBeVisible();
    await expect(page.getByText('🔍 審核中')).toBeVisible();
    await expect(page.getByText('↩️ 已退回，請修改')).toBeVisible();
    await expect(page.getByText('退回原因：價格請調整')).toBeVisible();
  });

  test('編輯已上架方案改價→送審→出現審核中橫幅（前台仍以原方案售票）', async ({ page }) => {
    await setGuideSession(page, GUIDE_ID);
    await mockGuideCsrf(page);

    let submitted = false;
    await page.route(`**/api/guide/activities/${ACTIVITY_ID}/plans/${PLAN_ID}`, async (route) => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
      }
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            id: PLAN_ID, name: '賞鯨升級方案', description: '', price_type: 'per_person', base_price: 2200,
            duration_minutes: 240, min_participants: 1, max_participants: 10, booking_type: 'scheduled',
            highlights: [], plan_inclusions: ['保險'], plan_exclusions: [], plan_notices: [], plan_refund_rules: [],
            status: 'active', reviewState: null, reviewAdminNote: null, isNewPlan: false,
          },
        }),
      });
    });
    await page.route(`**/api/guide/activities/${ACTIVITY_ID}/plans/${PLAN_ID}/submit`, (route) => {
      submitted = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { submitted: true } }) });
    });

    await page.goto(`/guide/activities/${ACTIVITY_ID}/plans/${PLAN_ID}`);
    await expect(page.getByRole('heading', { name: '編輯方案' })).toBeVisible();

    const priceInput = page.getByPlaceholder('1800');
    await expect(priceInput).toHaveValue('2200');
    await priceInput.fill('2600');

    await page.getByRole('button', { name: '送出審核' }).click();
    await expect(page.getByText('已送出審核，請等待管理者核准上架。')).toBeVisible();
    await expect(page.getByText(/前台仍以原方案內容售票/)).toBeVisible();
    expect(submitted).toBe(true);
  });

  test('新增方案→建立草稿→導向新方案編輯頁', async ({ page }) => {
    await setGuideSession(page, GUIDE_ID);
    await mockGuideCsrf(page);

    const NEW_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    let created = false;
    await page.route(`**/api/guide/activities/${ACTIVITY_ID}/plans`, (route) => {
      if (route.request().method() === 'POST') {
        created = true;
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { plan: { id: NEW_ID } } }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
    });
    await page.route(`**/api/guide/activities/${ACTIVITY_ID}/plans/${NEW_ID}`, (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            id: NEW_ID, name: '新方案A', description: '', price_type: 'per_person', base_price: 1500,
            duration_minutes: 180, min_participants: 1, max_participants: 8, booking_type: 'scheduled',
            highlights: [], plan_inclusions: [], plan_exclusions: [], plan_notices: [], plan_refund_rules: [],
            status: 'inactive', reviewState: null, reviewAdminNote: null, isNewPlan: true,
          },
        }),
      })
    );

    await page.goto(`/guide/activities/${ACTIVITY_ID}/plans/new`);
    await expect(page.getByRole('heading', { name: '新增方案' })).toBeVisible();
    await page.getByPlaceholder('例：包船賞鯨升級方案').fill('新方案A');
    await page.getByPlaceholder('1800').fill('1500');
    await page.getByRole('button', { name: /建立方案/ }).click();

    // 建立後導向新方案編輯頁，顯示送審按鈕。
    await expect(page).toHaveURL(new RegExp(`/plans/${NEW_ID}$`));
    await expect(page.getByRole('button', { name: '送出審核' })).toBeVisible();
    expect(created).toBe(true);
  });
});

test.describe('管理者方案審核', () => {
  test('方案審核分頁顯示 diff 並可核准', async ({ page }) => {
    await adminLogin(page);

    // 行程審核清單（預設分頁）需可載入，避免干擾。
    await page.route('**/api/admin/activity-reviews', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) })
    );
    await page.route('**/api/admin/plan-reviews', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: [{ id: PLAN_ID, name: '賞鯨升級方案', activityTitle: '龜山島賞鯨', guideName: '阿明', status: 'active', isNewPlan: false, pendingSubmittedAt: '2026-06-24T00:00:00Z', hasConflict: false }],
        }),
      })
    );
    await page.route(`**/api/admin/plan-reviews/${PLAN_ID}`, async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { plan: { name: '賞鯨升級方案', activity: { title: '龜山島賞鯨', slug: 'whale', region: '宜蘭縣', region_slug: 'yilan' } } } }) });
      }
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            plan: { name: '賞鯨升級方案', activity: { title: '龜山島賞鯨' } },
            reviewState: 'pending', hasConflict: false, isNewPlan: false,
            diff: [{ field: 'base_price', before: 2200, after: 2600 }],
          },
        }),
      });
    });

    await page.goto('/admin/activity-reviews');
    await page.getByRole('button', { name: /方案審核/ }).click();
    await expect(page.getByText('賞鯨升級方案')).toBeVisible();
    await page.getByRole('button', { name: /賞鯨升級方案/ }).click();
    await expect(page.getByText('價格')).toBeVisible();
    await expect(page.getByText('2600')).toBeVisible();
    await page.getByRole('button', { name: '核准' }).click();
    await expect(page.getByText(/已核准，方案內容已套用並上架/)).toBeVisible();
  });
});

import { test, expect, setGuideSession, adminLogin } from './helpers';

/**
 * 導遊共用行程編輯 + 管理者審核上架 E2E（backend 全程 page.route mock）。
 *
 * 導遊 API 走 HMAC cookie，E2E 的假簽章不會通過 verifyGuideSession，故一律 mock
 * /api/guide/** 回應（符合 CLAUDE.md：mock backend via page.route）。
 */

const GUIDE_ID = '11111111-1111-1111-1111-111111111111';
const ACTIVITY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function mockGuideCsrf(page: import('@playwright/test').Page) {
  return page.route('**/api/guide/auth/csrf**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { token: 'e2e' } }) })
  );
}

test.describe('導遊行程編輯與送審', () => {
  test('我的行程列表顯示審核狀態徽章', async ({ page }) => {
    await setGuideSession(page, GUIDE_ID);
    await mockGuideCsrf(page);
    await page.route('**/api/guide/activities', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: [
            { id: ACTIVITY_ID, title: '龜山島賞鯨', region: '宜蘭縣', status: 'published', reviewState: 'pending', reviewAdminNote: null, hasPendingChanges: true, updatedAt: '2026-06-24T00:00:00Z' },
            { id: 'bbbb', title: '退回的行程', region: '台北市', status: 'draft', reviewState: 'changes_requested', reviewAdminNote: '價格請改回原價', hasPendingChanges: true, updatedAt: '2026-06-23T00:00:00Z' },
          ],
        }),
      })
    );

    await page.goto('/guide/activities');
    await expect(page.getByText('龜山島賞鯨')).toBeVisible();
    await expect(page.getByText('審核中')).toBeVisible();
    await expect(page.getByText('已退回，請修改')).toBeVisible();
    await expect(page.getByText('退回原因：價格請改回原價')).toBeVisible();
  });

  test('編輯內容→送審→出現審核中橫幅；已上架行程提示前台仍顯示原內容', async ({ page }) => {
    await setGuideSession(page, GUIDE_ID);
    await mockGuideCsrf(page);

    let submitted = false;
    await page.route(`**/api/guide/activities/${ACTIVITY_ID}`, async (route) => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            id: ACTIVITY_ID, slug: 'whale', title: '龜山島賞鯨', tagline: '', shortDescription: '', description: '原描述',
            region: '宜蘭縣', category: 'nature', priceTwd: 1800, durationMinutes: 240, meetingPoint: '烏石港',
            meetingPointMapUrl: '', coverImageUrl: '', imageUrls: [], inclusions: ['保險'], exclusions: [], notices: [],
            refundRules: [], goodFor: [], safetyNotice: '', faq: [],
            status: 'published', reviewState: null, reviewAdminNote: null,
          },
        }),
      });
    });
    await page.route(`**/api/guide/activities/${ACTIVITY_ID}/submit`, (route) => {
      submitted = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { submitted: true } }) });
    });

    await page.goto(`/guide/activities/${ACTIVITY_ID}/edit`);
    await expect(page.getByRole('heading', { name: '編輯行程' })).toBeVisible();

    const titleInput = page.locator('input').first();
    await expect(titleInput).toHaveValue('龜山島賞鯨');
    await titleInput.fill('龜山島賞鯨一日遊');

    await page.getByRole('button', { name: '送出審核' }).click();
    await expect(page.getByText('已送出審核，請等待管理者核准上架。')).toBeVisible();
    await expect(page.getByText(/前台仍顯示原本已上架的內容/)).toBeVisible();
    expect(submitted).toBe(true);
  });
});

test.describe('管理者審核', () => {
  test('待審頁顯示 diff 並可核准', async ({ page }) => {
    await adminLogin(page);

    await page.route('**/api/admin/activity-reviews', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: [{ id: ACTIVITY_ID, title: '龜山島賞鯨', status: 'published', guideName: '阿明', pendingSubmittedAt: '2026-06-24T00:00:00Z', hasConflict: false }],
        }),
      })
    );
    await page.route(`**/api/admin/activities/${ACTIVITY_ID}/review`, async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { activity: { title: '龜山島賞鯨', slug: 'whale' } } }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            activity: { title: '龜山島賞鯨', slug: 'whale', region: '宜蘭縣', regionSlug: 'yilan' },
            reviewState: 'pending', hasConflict: false,
            diff: [{ field: 'title', before: '龜山島賞鯨', after: '龜山島賞鯨一日遊' }],
          },
        }),
      });
    });

    await page.goto('/admin/activity-reviews');
    await expect(page.getByText('待審行程')).toBeVisible();
    await page.getByRole('button', { name: /龜山島賞鯨/ }).click();
    await expect(page.getByText('行程名稱')).toBeVisible();
    await expect(page.getByText('龜山島賞鯨一日遊')).toBeVisible();
    await page.getByRole('button', { name: '核准' }).click();
    await expect(page.getByText(/已核准，內容已套用/)).toBeVisible();
  });
});

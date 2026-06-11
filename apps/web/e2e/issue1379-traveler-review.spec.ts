import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Issue #1379 — 旅客評論撰寫流程（真實瀏覽器，backend 以 page.route mock）。
 *
 * traveler 登入以假 Supabase session cookie + 攔截 `auth/v1/user` 模擬
 * （頁面 gate 走 supabase.auth.getUser()，需要 session + user endpoint）。
 */

const ORDER_ID = '13790000-aaaa-4bbb-8ccc-000000000001';

function orderBody(status: string) {
  return {
    ok: true,
    data: {
      id: ORDER_ID,
      status,
      totalTwd: 4000,
      peopleCount: 2,
      contactName: '測試旅客',
      contactEmail: 'traveler1379@example.com',
      contactPhone: '0912345678',
      title: '高雄柴山探洞體驗',
      scheduleStartAt: '2026-05-01T09:00:00+08:00',
      createdAt: '2026-04-01T00:00:00Z',
    },
  };
}

test.describe('issue1379 traveler review', () => {
  test('completed 訂單：?review=1 自動展開表單 → 送出 → 顯示等候審核', async ({ page }) => {
    await setTravelerSession(page);
    await page.route(`**/api/me/orders/${ORDER_ID}**`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orderBody('completed')) });
    });

    let submittedPayload: Record<string, unknown> | null = null;
    await page.route('**/api/reviews', async (route: Route) => {
      submittedPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { id: 'rev-1', status: 'pending' } }),
      });
    });

    await page.goto(`/me/orders/${ORDER_ID}?review=1`);

    // ?review=1 → 表單自動展開（不需先點「撰寫評價」）
    const textarea = page.locator('#order-review-text');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await page.locator('button[aria-label="rating 4"]').click();
    await textarea.fill('導遊很專業，行程安排得很好！');
    await page.getByRole('button', { name: '提交評價' }).click();

    await expect(page.getByText('評價已送出，等候審核')).toBeVisible();
    expect(submittedPayload).not.toBeNull();
    expect(submittedPayload!.rating).toBe(4);
    expect(submittedPayload!.bookingId).toBe(ORDER_ID);
  });

  test('非 completed（paid）訂單：無撰寫評價入口，顯示完成後提示', async ({ page }) => {
    await setTravelerSession(page);
    await page.route(`**/api/me/orders/${ORDER_ID}**`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orderBody('paid')) });
    });

    await page.goto(`/me/orders/${ORDER_ID}?review=1`);
    await expect(page.getByText('行程完成後即可撰寫評價')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: '撰寫評價' })).toHaveCount(0);
    await expect(page.locator('#order-review-text')).toHaveCount(0);
  });

  test('後台：pending 評論出現在 admin 待審核列表', async ({ authedPage }) => {
    await authedPage.route('**/api/admin/reviews**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: [
            {
              id: 'rev-1',
              activity_slug: 'kaohsiung-chaishan-cave-experience',
              author: 'traveler1379@example.com',
              rating: 4,
              review_text: '導遊很專業，行程安排得很好！',
              review_date: '2026-06-11',
              status: 'pending',
              created_at: '2026-06-11T10:00:00Z',
            },
          ],
        }),
      });
    });

    await authedPage.goto('/admin/reviews');
    await expect(authedPage.getByText('導遊很專業，行程安排得很好！')).toBeVisible({ timeout: 10_000 });
    await expect(authedPage.getByText(/待審核\s*1\s*筆/)).toBeVisible();
  });
});

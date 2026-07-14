import { test, expect, setTravelerSession, setGuideSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Issue #1383 — 訂單改期全流程（真實瀏覽器，backend 以 page.route mock）。
 * traveler：訂單頁入口 → 選場次 → 送出 → 處理中提示。
 * guide：待辦清單 → 確認改期。
 */

const ORDER_ID = '13830000-aaaa-4bbb-8ccc-000000000001';
const REQ_ID = 'res_e2e_0001';

const HOUR_MS = 3600_000;
// 相對於執行當下計算，避免寫死日期被 168h 窗口隨時間推移擋掉。
const farFutureStart = new Date(Date.now() + 30 * 24 * HOUR_MS).toISOString();   // 30 天後 > 168h（可自助改期）
const nearFutureStart = new Date(Date.now() + 5 * 24 * HOUR_MS).toISOString();   // 5 天後 < 168h（須聯絡客服）

function orderBody(status: string, scheduleStartAt: string = farFutureStart) {
  return {
    ok: true,
    data: {
      id: ORDER_ID,
      status,
      totalTwd: 4000,
      peopleCount: 2,
      contactName: '改期旅客',
      contactEmail: 'traveler-e2e@example.com',
      title: '高雄柴山探洞體驗',
      scheduleStartAt,
      createdAt: '2026-06-01T00:00:00Z',
    },
  };
}

const OPTIONS = {
  ok: true,
  data: [
    { id: 'sch_new_1', startAt: '2026-07-05T09:00:00+08:00', endAt: '2026-07-05T13:00:00+08:00', capacityLeft: 6 },
    { id: 'sch_new_2', startAt: '2026-07-08T09:00:00+08:00', endAt: '2026-07-08T13:00:00+08:00', capacityLeft: 3 },
  ],
};

test.describe('issue1383 reschedule', () => {
  test('traveler：paid 訂單申請改期 → 選場次送出 → 顯示處理中與撤回', async ({ page }) => {
    await setTravelerSession(page);

    let orderStatus = 'paid';
    let submittedPayload: Record<string, unknown> | null = null;

    await page.route(`**/api/v2/orders/${ORDER_ID}/reschedule-options**`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OPTIONS) });
    });
    await page.route(`**/api/v2/orders/${ORDER_ID}/reschedule-requests`, async (route: Route) => {
      submittedPayload = route.request().postDataJSON();
      orderStatus = 'reschedule_requested';
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { id: REQ_ID, status: 'requested', orderStatus } }),
      });
    });
    await page.route(`**/api/v2/orders/${ORDER_ID}`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orderBody(orderStatus)) });
    });

    await page.goto(`/me/orders/${ORDER_ID}`);

    const openBtn = page.locator('[data-testid="reschedule-open-btn"]');
    await expect(openBtn).toBeVisible({ timeout: 10_000 });
    await openBtn.click();

    const select = page.locator('[data-testid="reschedule-target-select"]');
    await expect(select).toBeVisible();
    await select.selectOption('sch_new_2');
    await page.locator('[data-testid="reschedule-submit-btn"]').click();

    await expect(page.locator('[data-testid="reschedule-pending"]')).toBeVisible();
    await expect(page.locator('[data-testid="reschedule-withdraw-btn"]')).toBeVisible();
    expect(submittedPayload).not.toBeNull();
    expect(submittedPayload!.toScheduleId).toBe('sch_new_2');
  });

  test('traveler：completed 訂單不顯示改期入口', async ({ page }) => {
    await setTravelerSession(page);
    await page.route(`**/api/v2/orders/${ORDER_ID}`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orderBody('completed')) });
    });

    await page.goto(`/me/orders/${ORDER_ID}`);
    await expect(page.getByText('撰寫評價')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="reschedule-open-btn"]')).toHaveCount(0);
  });

  test('traveler：距活動 <168h（7 天）→ 無改期入口、顯示聯絡客服提示', async ({ page }) => {
    await setTravelerSession(page);
    await page.route(`**/api/v2/orders/${ORDER_ID}`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orderBody('paid', nearFutureStart)) });
    });

    await page.goto(`/me/orders/${ORDER_ID}`);
    const hint = page.locator('[data-testid="reschedule-contact-support"]');
    await expect(hint).toBeVisible({ timeout: 10_000 });
    await expect(hint).toContainText('聯絡客服');
    await expect(page.locator('[data-testid="reschedule-open-btn"]')).toHaveCount(0);
  });

  test('guide：待辦清單顯示申請 → 確認改期 → 清單更新', async ({ page }) => {
    await setGuideSession(page, 'guide-1383');

    let decided: string | null = null;
    await page.route('**/api/v2/guide/reschedule-requests', async (route: Route) => {
      const data = decided
        ? [{ id: REQ_ID, orderId: ORDER_ID, status: 'approved', fromStartAt: '2026-07-01T09:00:00+08:00', toStartAt: '2026-07-08T09:00:00+08:00', requestedAt: '2026-06-11T00:00:00Z', activityTitle: '高雄柴山探洞體驗', order: { contactName: '改期旅客', peopleCount: 2 } }]
        : [{ id: REQ_ID, orderId: ORDER_ID, status: 'requested', fromStartAt: '2026-07-01T09:00:00+08:00', toStartAt: '2026-07-08T09:00:00+08:00', requestedAt: '2026-06-11T00:00:00Z', activityTitle: '高雄柴山探洞體驗', order: { contactName: '改期旅客', peopleCount: 2 } }];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
    });
    await page.route(`**/api/v2/guide/reschedule-requests/${REQ_ID}/decision`, async (route: Route) => {
      decided = (route.request().postDataJSON() as { action?: string })?.action ?? null;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { id: REQ_ID, status: 'approved' } }) });
    });
    await page.route('**/api/me/csrf**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.goto('/guide/reschedules');

    const row = page.locator(`[data-testid="reschedule-row-${REQ_ID}"]`);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('改期旅客');

    await page.locator(`[data-testid="reschedule-approve-${REQ_ID}"]`).click();
    await expect(page.getByText('已改期')).toBeVisible();
    expect(decided).toBe('approve');
  });
});

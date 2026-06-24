/**
 * 三種預約模式 — 導遊「待審核」分頁 + 批准/婉拒 E2E。
 *
 * setGuideSession 播種 format-valid guide cookie 讓 /guide/* 頁面渲染；
 * /api/guide/* 一律 page.route mock（真 HMAC 與 CSRF 由 API 單測涵蓋）。
 */
import { test, expect, setGuideSession } from './helpers';
import type { Page, Route } from '@playwright/test';

const GUIDE_ID = 'guide-approval-e2e';

const PENDING_ROWS = [
  {
    bookingId: 'bk-pending-1',
    bookingNo: 'BK-P-1',
    tourTitle: '高雄柴山探洞體驗',
    planName: '申請制深度探洞',
    guestName: '王小明',
    startAt: '2026-08-01T06:00:00.000Z',
    partySize: 2,
    totalTwd: 5000,
    createdAt: '2026-07-20T00:00:00.000Z',
  },
];

async function installGuideRoutes(page: Page, opts: { pendingAfterDecision?: unknown[] } = {}) {
  // 既有訂單列表（其他分頁用）
  await page.route('**/api/guide/bookings', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  let decided = false;
  await page.route('**/api/guide/bookings/pending-approval**', async (route: Route) => {
    const rows = decided ? (opts.pendingAfterDecision ?? []) : PENDING_ROWS;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: rows }) });
  });

  await page.route('**/api/guide/bookings/*/approval', async (route: Route) => {
    decided = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { bookingId: 'bk-pending-1', status: 'draft', guideApprovalStatus: 'approved', action: 'approve' } }),
    });
  });
}

test.describe('三種預約模式 — 導遊待審核', () => {
  test.describe.configure({ timeout: 90_000 });

  test('待審核分頁顯示申請，批准後從清單移除', async ({ page }) => {
    await setGuideSession(page, GUIDE_ID);
    await installGuideRoutes(page);

    await page.goto('/guide/bookings', { waitUntil: 'commit', timeout: 60_000 });

    // 切到「待審核」分頁
    await page.getByRole('tab', { name: '待審核' }).click();

    await expect(page.getByText('申請制深度探洞', { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('王小明')).toBeVisible();

    // 批准
    await page.getByRole('button', { name: '批准' }).click();

    // 清單刷新後空了
    await expect(page.getByText('目前沒有待審核的預約申請')).toBeVisible({ timeout: 20_000 });
  });
});

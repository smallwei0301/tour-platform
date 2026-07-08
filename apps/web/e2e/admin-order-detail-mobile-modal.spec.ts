import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Admin 後台訂單管理 — 手機版訂單詳情彈出視窗。
 *
 * 背景：桌機版訂單管理是左右並排（清單 + 詳情面板），但在手機（< 768px）
 * 上版面會堆疊成單欄，點選某筆訂單後詳情被排到清單下方，使用者必須一路
 * 捲到頁面最下面才看得到。
 *
 * 鎖定行為：
 *   1. 手機版：點擊清單內的訂單 → 立即跳出 ResponsiveModal 訂單詳情，
 *      無需捲動到頁尾；按關閉鈕即收起。
 *   2. 桌機版：維持右側並排面板，不使用彈出視窗。
 */

test.describe.configure({ timeout: 90_000 });

const ORDER_ROW = {
  id: 'ORD-MOBILE-1',
  status: 'paid',
  totalTwd: 3000,
  costTwd: 2550,
  marginTwd: 450,
  title: '柴山祕境健行',
  peopleCount: 2,
  contactName: '王小明',
  contactEmail: 'ming@example.com',
  createdAt: '2026-06-01T02:00:00.000Z',
  paidAt: '2026-06-01T02:05:00.000Z',
  adminNote: '',
  trade_no: null,
};

async function mockOrdersApi(page: import('@playwright/test').Page) {
  // 清單
  await page.route('**/api/v2/admin/orders', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [ORDER_ROW] }) }),
  );
  // 詳情 + 子資源（audit-logs / timeline / messages）
  await page.route('**/api/v2/admin/orders/**', (r: Route) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/audit-logs')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
    }
    if (path.endsWith('/timeline')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { timeline: [] } }) });
    }
    if (path.endsWith('/messages')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { messages: [] } }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: ORDER_ROW }) });
  });
}

test.describe('手機版（< 768px）', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('點擊訂單即跳出詳情彈窗，按關閉收起', async ({ authedPage: page }) => {
    await mockOrdersApi(page);
    await page.goto('/admin/orders');

    // 清單卡片出現；此時尚未選取，詳情彈窗不應存在。
    await expect(page.getByText('柴山祕境健行').first()).toBeVisible({ timeout: 20_000 });
    const modal = page.getByTestId('admin-order-detail-modal');
    await expect(modal).toHaveCount(0);

    // 點擊訂單卡片 → 立即跳出彈窗（dialog），無需捲動到頁尾。
    await page.getByText('柴山祕境健行').first().click();
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByRole('dialog')).toBeVisible();
    await expect(modal).toContainText('訂單詳情');
    await expect(modal).toContainText('ORD-MOBILE-1');
    await expect(modal).toContainText('王小明');

    // 按關閉鈕 → 彈窗收起。
    await modal.getByRole('button', { name: '關閉' }).click();
    await expect(modal).toHaveCount(0);
  });
});

test.describe('桌機版（≥ 768px）', () => {
  test('維持右側並排面板，不使用彈出視窗', async ({ authedPage: page }) => {
    await mockOrdersApi(page);
    await page.goto('/admin/orders');

    await expect(page.getByText('柴山祕境健行').first()).toBeVisible({ timeout: 20_000 });
    await page.getByText('柴山祕境健行').first().click();

    // 桌機版詳情顯示在右側面板，標題列含「訂單詳情」；不出現彈窗 overlay。
    const panel = page.locator('[data-guide="order-detail"]');
    await expect(panel).toContainText('訂單詳情');
    await expect(panel).toContainText('ORD-MOBILE-1');
    await expect(page.getByTestId('admin-order-detail-modal')).toHaveCount(0);
  });
});

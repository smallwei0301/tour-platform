/**
 * 防呆 E2E：
 *   1. 訂單詳情「狀態下拉」停用「取消／退款中／已退款」終端狀態，並顯示提示。
 *   2. 退款管理頁顯示 ECPay／現金退款流程說明面板，並連到完整說明頁。
 *
 * 後端以 page.route() mock，沿用 helpers.ts 的 authedPage。
 */
import { test, expect } from './helpers';
import type { Page } from '@playwright/test';

type OrderFixture = {
  id: string; status: string; totalTwd: number; costTwd: number; marginTwd: number;
  trade_no: string | null; title: string; peopleCount: number;
  contactName: string; contactEmail: string; createdAt: string; paidAt: string | null; adminNote: string;
};

const order: OrderFixture = {
  id: 'ord-guard-001', status: 'paid', totalTwd: 1500, costTwd: 1000, marginTwd: 500,
  trade_no: null, title: '北投溫泉散策', peopleCount: 1,
  contactName: '陳小華', contactEmail: 'hua@example.com',
  createdAt: '2026-06-01T02:00:00Z', paidAt: '2026-06-01T03:00:00Z', adminNote: '',
};

async function stubOrders(page: Page) {
  await page.route('**/api/admin/orders**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (s: number, b: unknown) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
    if (/\/audit-logs$/.test(path)) return json(200, { ok: true, data: [] });
    if (/\/timeline$/.test(path)) return json(200, { ok: true, data: { timeline: [] } });
    if (/\/messages$/.test(path)) return json(200, { ok: true, data: { messages: [] } });
    if (/\/api\/admin\/orders\/[^/]+$/.test(path)) return json(200, { ok: true, data: order });
    return json(200, { ok: true, data: [order] });
  });
}

test('訂單詳情狀態下拉：取消／退款中／已退款 選項被停用，並顯示防呆提示', async ({ authedPage: page }) => {
  await stubOrders(page);
  await page.goto('/admin/orders');
  await page.waitForResponse((r) => r.url().includes('/api/admin/orders') && r.status() === 200, { timeout: 30000 });
  await page.getByText(order.title).first().click();
  await expect(page.locator('[data-guide="order-detail"]')).toContainText(order.contactEmail, { timeout: 30000 });

  for (const blocked of ['cancelled_by_user', 'cancelled_by_guide', 'refund_pending', 'refunded']) {
    const opt = page.locator(`#admin-order-status option[value="${blocked}"]`);
    await expect(opt).toBeDisabled();
  }
  // 允許的狀態不可被停用
  for (const ok of ['paid', 'confirmed', 'completed', 'rejected']) {
    await expect(page.locator(`#admin-order-status option[value="${ok}"]`)).not.toBeDisabled();
  }
  await expect(page.locator('[data-guide="manual-status-blocked-hint"]')).toBeVisible();
});

test('退款管理頁顯示 ECPay／現金退款流程說明，並連到完整說明頁', async ({ authedPage: page }) => {
  await page.route('**/api/admin/refund-requests**', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) }),
  );
  await page.goto('/admin/refunds');
  await page.waitForResponse((r) => r.url().includes('/api/admin/refund-requests') && r.status() === 200, { timeout: 30000 });

  const help = page.locator('[data-guide="refund-flow-help"]');
  await expect(help).toBeVisible();
  await help.locator('summary').click();
  await expect(help).toContainText('ECPay 線上付款訂單');
  await expect(help).toContainText('現金／線下訂單');
  await expect(help.locator('a[href="/admin/help/payments-refunds"]')).toBeVisible();
});

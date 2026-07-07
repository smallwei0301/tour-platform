/**
 * 部分退款 E2E：退款中（refund_pending）訂單的「執行退款」區塊出現退款金額輸入框；
 * 填入部分金額後送出，前端會把 refundAmount 帶進 refund-execute 的 request body。
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
  id: 'ord-partial-001', status: 'refund_pending', totalTwd: 1500, costTwd: 1000, marginTwd: 500,
  trade_no: 'ECPAY-TN-1', title: '蘭嶼潛水體驗', peopleCount: 1,
  contactName: '林小美', contactEmail: 'mei@example.com',
  createdAt: '2026-06-01T02:00:00Z', paidAt: '2026-06-01T03:00:00Z', adminNote: '',
};

async function stubOrders(page: Page, onRefundExecute: (body: unknown) => void) {
  await page.route('**/api/v2/admin/orders**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (s: number, b: unknown) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
    if (/\/refund-execute$/.test(path)) {
      const body = route.request().postDataJSON?.() ?? null;
      onRefundExecute(body);
      return json(200, { ok: true, data: { refunded: true, partial: true, refundedAmount: 600, ecpayRefundTradeNo: 'RF-1' } });
    }
    if (/\/audit-logs$/.test(path)) return json(200, { ok: true, data: [] });
    if (/\/timeline$/.test(path)) return json(200, { ok: true, data: { timeline: [] } });
    if (/\/messages$/.test(path)) return json(200, { ok: true, data: { messages: [] } });
    if (/\/api\/admin\/orders\/[^/]+$/.test(path)) return json(200, { ok: true, data: order });
    return json(200, { ok: true, data: [order] });
  });
}

test('退款中訂單：執行退款區塊顯示退款金額輸入框，部分金額會帶進 refundAmount', async ({ authedPage: page }) => {
  let refundBody: any = null;
  await stubOrders(page, (b) => { refundBody = b; });

  await page.goto('/admin/orders');
  await page.waitForResponse((r) => r.url().includes('/api/v2/admin/orders') && r.status() === 200, { timeout: 30000 });
  await page.getByText(order.title).first().click();
  await expect(page.locator('[data-guide="order-detail"]')).toContainText(order.contactEmail, { timeout: 30000 });

  // 退款金額輸入框存在（ECPay 訂單也有）
  const amountInput = page.locator('[data-guide="refund-amount-input"]');
  await expect(amountInput).toBeVisible();

  // 填入部分金額並執行
  await amountInput.fill('600');
  await page.locator('[data-guide="refund-execute-btn"]').click();

  // 成功後出現「退款已執行」訊息；mock route 已捕捉 request body。
  await expect(page.locator('[data-guide="refund-executed-msg"]')).toBeVisible({ timeout: 30000 });
  expect(refundBody).toBeTruthy();
  expect(refundBody.refundAmount).toBe(600);
});

test('退款金額超過訂單總額：前端即時擋下，不打 API', async ({ authedPage: page }) => {
  let called = false;
  await stubOrders(page, () => { called = true; });

  await page.goto('/admin/orders');
  await page.waitForResponse((r) => r.url().includes('/api/v2/admin/orders') && r.status() === 200, { timeout: 30000 });
  await page.getByText(order.title).first().click();
  await expect(page.locator('[data-guide="order-detail"]')).toContainText(order.contactEmail, { timeout: 30000 });

  await page.locator('[data-guide="refund-amount-input"]').fill('99999');
  await page.locator('[data-guide="refund-execute-btn"]').click();

  // 前端驗證錯誤訊息出現、且未呼叫 refund-execute
  await expect(page.locator('[data-guide="refund-execute-section"]')).toContainText('不可超過訂單總額');
  expect(called).toBe(false);
});

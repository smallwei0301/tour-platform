/**
 * 後台訂單詳情：取消＋退款按鈕 + 執行退款錯誤防呆
 *
 * 覆蓋本次新增的前端行為：
 *   1. 進行中訂單（paid）顯示「取消並全額退款」按鈕，點擊會 POST /cancel 並顯示成功。
 *   2. 退款中（refund_pending）現金訂單「執行退款」失敗時，顯示真正的錯誤碼／訊息（防呆），
 *      而非死的「退款執行失敗」。
 *   3. 訂單詳情提供「金流／退款處理說明」連結，指向 /admin/help/payments-refunds。
 *
 * 後端全部以 page.route() mock，不依賴 Supabase／seed。沿用 helpers.ts 的 authedPage。
 */
import { test, expect } from './helpers';
import type { Page } from '@playwright/test';

type OrderFixture = {
  id: string;
  status: string;
  totalTwd: number;
  costTwd: number;
  marginTwd: number;
  trade_no: string | null;
  title: string;
  peopleCount: number;
  contactName: string;
  contactEmail: string;
  createdAt: string;
  paidAt: string | null;
  adminNote: string;
};

/**
 * 統一攔截所有 /api/v2/admin/orders** 端點，依路徑＋method 分派。
 * cancelResponse / refundResponse 可注入成功或失敗回應。
 */
async function stubOrders(
  page: Page,
  order: OrderFixture,
  opts: {
    cancelResponse?: { status: number; body: unknown };
    refundResponse?: { status: number; body: unknown };
  } = {},
) {
  const captured: { cancel?: string; refund?: string } = {};

  await page.route('**/api/v2/admin/orders**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    // 子路徑：audit-logs / timeline / messages → 空資料
    if (/\/audit-logs$/.test(path)) return json(200, { ok: true, data: [] });
    if (/\/timeline$/.test(path)) return json(200, { ok: true, data: { timeline: [] } });
    if (/\/messages$/.test(path)) return json(200, { ok: true, data: { messages: [] } });

    // 取消＋退款
    if (/\/cancel$/.test(path) && method === 'POST') {
      captured.cancel = req.url();
      const r = opts.cancelResponse ?? {
        status: 200,
        body: { ok: true, data: { orderId: order.id, status: 'cancelled_by_guide', refundRequestId: 'ref_x', refundStatus: 'refunded' } },
      };
      if (r.status === 200) order.status = 'refunded';
      return json(r.status, r.body);
    }

    // 執行退款
    if (/\/refund-execute$/.test(path) && method === 'POST') {
      captured.refund = req.url();
      const r = opts.refundResponse ?? { status: 200, body: { ok: true, data: { refunded: true } } };
      return json(r.status, r.body);
    }

    // 訂單詳情：/api/v2/admin/orders/{id}
    if (/\/api\/admin\/orders\/[^/]+$/.test(path)) {
      return json(200, { ok: true, data: order });
    }

    // 清單：/api/v2/admin/orders
    return json(200, { ok: true, data: [order] });
  });

  return captured;
}

const baseOrder: OrderFixture = {
  id: 'ord-cr-001',
  status: 'paid',
  totalTwd: 1800,
  costTwd: 1200,
  marginTwd: 600,
  trade_no: null, // 現金訂單
  title: '大稻埕散步導覽',
  peopleCount: 2,
  contactName: '王小明',
  contactEmail: 'ming@example.com',
  createdAt: '2026-06-01T02:00:00Z',
  paidAt: '2026-06-01T03:00:00Z',
  adminNote: '',
};

async function openDetail(page: Page, order: OrderFixture) {
  await page.goto('/admin/orders');
  await page.waitForResponse((r) => r.url().includes('/api/v2/admin/orders') && r.status() === 200, { timeout: 30000 });
  await page.getByText(order.title).first().click();
  await expect(page.locator('[data-guide="order-detail"]')).toContainText(order.contactEmail, { timeout: 30000 });
}

test('進行中訂單顯示「取消並全額退款」按鈕，點擊後 POST /cancel 並顯示成功', async ({ authedPage: page }) => {
  const order = { ...baseOrder, status: 'paid' };
  const captured = await stubOrders(page, order);
  await openDetail(page, order);

  const cancelBtn = page.locator('[data-guide="cancel-refund-btn"]');
  await expect(cancelBtn).toBeVisible();

  page.once('dialog', (d) => d.accept()); // window.confirm
  await cancelBtn.click();

  await expect(page.locator('[data-guide="cancel-refund-done"]')).toContainText('已取消並完成退款', { timeout: 30000 });
  expect(captured.cancel, '應呼叫 /cancel 端點').toContain('/cancel');
});

test('退款中現金訂單：執行退款失敗時顯示真正錯誤訊息（防呆）', async ({ authedPage: page }) => {
  const order = { ...baseOrder, id: 'ord-cr-002', status: 'refund_pending', trade_no: null };
  await stubOrders(page, order, {
    refundResponse: {
      status: 409,
      body: { ok: false, error: { code: 'INVALID_STATUS', message: 'order must be refund_pending to execute refund' } },
    },
  });
  await openDetail(page, order);

  // 現金訂單需填退款原因才能按
  await page.locator('[data-guide="refund-reason-input"]').fill('旅客要求退款');
  await page.locator('[data-guide="refund-execute-btn"]').click();

  const section = page.locator('[data-guide="refund-execute-section"]');
  await expect(section).toContainText('退款執行失敗', { timeout: 30000 });
  // 防呆：必須帶出可讀說明（INVALID_STATUS 對應的 hint）＋原始訊息，而非只有死訊息
  await expect(section).toContainText('需為「退款中」');
  await expect(section).toContainText('order must be refund_pending');
});

test('進行中訂單不顯示退款原因輸入（取消＋退款不需手填）；refund_pending 才有執行退款', async ({ authedPage: page }) => {
  const order = { ...baseOrder, id: 'ord-cr-003', status: 'paid' };
  await stubOrders(page, order);
  await openDetail(page, order);

  await expect(page.locator('[data-guide="cancel-refund-section"]')).toBeVisible();
  await expect(page.locator('[data-guide="refund-execute-section"]')).toHaveCount(0);
});

test('訂單詳情提供金流／退款處理說明連結', async ({ authedPage: page }) => {
  const order = { ...baseOrder, id: 'ord-cr-004' };
  await stubOrders(page, order);
  await openDetail(page, order);

  const link = page.locator('[data-guide="payments-refunds-guide-link"]');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/admin/help/payments-refunds');
});

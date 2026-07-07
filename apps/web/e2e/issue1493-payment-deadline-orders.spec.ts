import { test, expect, setTravelerSession } from './helpers';

// #1493 — 旅客「我的訂單」：未付款顯示付款期限+剩餘時間+前往付款；逾時顯示已逾時自動取消。
const FUTURE = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(); // +10h

const ORDERS = [
  {
    id: 'ord-pending',
    status: 'pending_payment',
    totalTwd: 3200,
    title: '無人島一日探險',
    peopleCount: 2,
    createdAt: '2030-07-01T00:00:00Z',
    paidAt: null,
    paymentDeadlineAt: FUTURE,
  },
  {
    id: 'ord-expired',
    status: 'cancelled_unpaid',
    totalTwd: 1800,
    title: '老城區半日漫步',
    peopleCount: 1,
    createdAt: '2030-06-01T00:00:00Z',
    paidAt: null,
    paymentDeadlineAt: '2030-06-02T00:00:00Z',
  },
];

test.describe('my orders payment deadline (#1493)', () => {
  test('shows deadline + pay-now for unpaid, and auto-cancelled label for expired', async ({ page }) => {
    await setTravelerSession(page);
    await page.route('**/api/v2/orders', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: ORDERS }) });
    });

    await page.goto('/me/orders');

    // 未付款卡片：付款期限 banner + 前往付款。
    const deadline = page.getByTestId('order-payment-deadline');
    await expect(deadline).toBeVisible();
    await expect(deadline).toContainText('請於');
    const payNow = page.getByTestId('order-resume-payment');
    await expect(payNow).toBeVisible();
    await expect(payNow).toContainText('前往付款');

    // 逾時卡片：狀態標示為已逾時自動取消。
    const expiredCard = page.locator('[data-order-id="ord-expired"]');
    await expect(expiredCard).toContainText('已逾時自動取消');
  });
});

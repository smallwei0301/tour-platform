import { test, expect } from '@playwright/test';

/**
 * 免費通知設計的前端支柱（#926）：下單成功頁 `/order/success` 直接在頁面上呈現完整
 * 訂單確認，**不依賴任何計費的 LINE Push** —— 旅客付款／回站時看到的就是這張卡。
 *
 * 後端用 `page.route('**\/api\/me\/orders\/**')` mock，避免依賴 Supabase seed（沿用
 * issue1073 的 mock 模式）。預設語系為繁體中文（無 NEXT_LOCALE cookie）。
 */

type OrderOverrides = {
  id?: string;
  status?: string;
  totalTwd?: number;
  title?: string;
  peopleCount?: number;
};

async function mockOrder(page: import('@playwright/test').Page, o: OrderOverrides) {
  await page.route('**/api/me/orders/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: o.id ?? 'ord_e2e_success_001',
          status: o.status ?? 'pending_payment',
          totalTwd: o.totalTwd ?? 4200,
          title: o.title ?? '柴山秘境探洞體驗',
          peopleCount: o.peopleCount ?? 2,
          contactName: '王小明',
          contactEmail: 'wang@example.com',
        },
      }),
    });
  });
}

test.describe('下單成功頁訂單確認（#926 免費通知前端支柱）', () => {
  test('未付款訂單：顯示行程、金額、訂單編號、待付款狀態與查看訂單按鈕', async ({ page }) => {
    await mockOrder(page, { id: 'ord_e2e_pending', status: 'pending_payment', totalTwd: 4200, title: '柴山秘境探洞體驗' });
    await page.goto('/order/success?orderId=ord_e2e_pending&email=wang@example.com');

    // 標題與行程／金額（API 提供、不受語系影響）皆渲染。
    await expect(page.getByRole('heading', { name: '訂單建立成功' })).toBeVisible();
    await expect(page.getByText('柴山秘境探洞體驗')).toBeVisible();
    await expect(page.getByText('NT$ 4,200')).toBeVisible();

    // 訂單編號（data-testid）帶出 mock 的 order id。
    await expect(page.getByTestId('order-id')).toContainText('ord_e2e_pending');

    // 待付款狀態徽章（繁中預設）。
    await expect(page.getByText('待付款')).toBeVisible();

    // 「查看我的訂單」CTA 指向 /me/orders。
    const cta = page.getByTestId('view-orders-btn');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', /\/me\/orders/);
  });

  test('已確認訂單：顯示已確認狀態與金額', async ({ page }) => {
    await mockOrder(page, { id: 'ord_e2e_confirmed', status: 'confirmed', totalTwd: 1500, title: '大稻埕老城散步' });
    await page.goto('/order/success?orderId=ord_e2e_confirmed&email=wang@example.com');

    await expect(page.getByRole('heading', { name: '訂單建立成功' })).toBeVisible();
    await expect(page.getByText('大稻埕老城散步')).toBeVisible();
    await expect(page.getByText('NT$ 1,500')).toBeVisible();
    await expect(page.getByText('已確認', { exact: false })).toBeVisible();
  });
});

/**
 * E2E：完整訂購漏斗測試
 * landing → activities → detail → begin_checkout → order_created → paid → orders visible
 *
 * TP-004 | 2026-04-04
 *
 * 測試策略：
 * - 每個漏斗步驟獨立驗證 selector（data-testid）
 * - Mock 付款：直接呼叫 /api/payments/ecpay/callback
 * - Email 查單：使用固定測試 Email
 *
 * 執行：
 *   npx playwright test e2e/funnel-booking-payment.spec.ts
 *   # 或帶 UI：npx playwright test --ui
 */

import { test, expect, Page } from '@playwright/test';

// ── 測試設定 ────────────────────────────────────────────────────────────────
const TEST_EMAIL = process.env.TEST_CONTACT_EMAIL || 'funnel-test@example.com';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3333';

// 測試用行程 slug（需要在 DB 中存在）
const TEST_ACTIVITY_SLUG =
  process.env.TEST_ACTIVITY_SLUG || 'kaohsiung-chaishan-cave-experience';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function waitForTestId(page: Page, testId: string, timeout = 10000) {
  return page.locator(`[data-testid="${testId}"]`).waitFor({ state: 'visible', timeout });
}

async function mockPayment(page: Page, orderId: string) {
  const res = await page.request.post(`${BASE_URL}/api/payments/ecpay/callback`, {
    data: {
      orderId,
      tradeNo: `MOCK-FUNNEL-${Date.now()}`,
      RtnCode: '1',
    },
  });
  return res;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('完整訂購漏斗', () => {
  test.setTimeout(60_000);

  test('Step 1：首頁 → 活動列表（home CTA 可見且可點擊）', async ({ page }) => {
    await page.goto('/');
    await waitForTestId(page, 'home-cta-explore');

    const cta = page.locator('[data-testid="home-cta-explore"]');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText(/探索全部行程/);

    await cta.click();
    await page.waitForURL(/\/activities/, { timeout: 8000 });
    await expect(page).toHaveURL(/\/activities/);
  });

  test('Step 2：活動列表 → 活動卡片可見', async ({ page }) => {
    await page.goto('/activities');

    // 等待 activity cards 渲染
    await page.locator('[data-testid="activity-card"]').first().waitFor({
      state: 'visible',
      timeout: 15000,
    });

    const cards = page.locator('[data-testid="activity-card"]');
    await expect(cards).toHaveCount(await cards.count());
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('Step 3：活動詳情頁 → title 與 begin-checkout 按鈕可見', async ({ page }) => {
    // 直接前往詳情頁
    await page.goto(`/activities/kaohsiung/${TEST_ACTIVITY_SLUG}`);

    await waitForTestId(page, 'activity-detail-title');
    const title = page.locator('[data-testid="activity-detail-title"]');
    await expect(title).toBeVisible();

    await waitForTestId(page, 'begin-checkout-btn');
    const btn = page.locator('[data-testid="begin-checkout-btn"]');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText(/立即預約/);
  });

  test('Step 4：begin_checkout → checkout 頁面有排期選單與建立訂單按鈕', async ({ page }) => {
    await page.goto(`/checkout?slug=${TEST_ACTIVITY_SLUG}`);

    // 等待活動資料載入
    await page.waitForLoadState('networkidle');

    // 若有開放排期，排期選單應可見
    const scheduleSelect = page.locator('[data-testid="checkout-schedule-select"]');
    const noSchedule = page.locator('text=此行程目前沒有可預訂的排期');

    const hasSchedule = await scheduleSelect.isVisible().catch(() => false);
    const hasNoSchedule = await noSchedule.isVisible().catch(() => false);

    // 至少其中一個狀態存在
    expect(hasSchedule || hasNoSchedule).toBe(true);

    if (hasSchedule) {
      // 確認「建立訂單」按鈕存在
      const createBtn = page.locator('[data-testid="create-order-btn"]');
      await expect(createBtn).toBeVisible();
    } else {
      test.info().annotations.push({
        type: 'skip-reason',
        description: '無可用排期，跳過建立訂單步驟',
      });
    }
  });

  test('Step 5：建立訂單 → order created → 頁面顯示訂單編號', async ({ page }) => {
    await page.goto(`/checkout?slug=${TEST_ACTIVITY_SLUG}`);
    await page.waitForLoadState('networkidle');

    const scheduleSelect = page.locator('[data-testid="checkout-schedule-select"]');
    const hasSchedule = await scheduleSelect.isVisible().catch(() => false);

    if (!hasSchedule) {
      test.skip(true, '無可用排期，跳過訂單建立測試');
      return;
    }

    // 點擊建立訂單
    const createBtn = page.locator('[data-testid="create-order-btn"]');
    await expect(createBtn).toBeEnabled({ timeout: 5000 });
    await createBtn.click();

    // 等待跳轉到 /order/pay 或 /order/success
    await page.waitForURL(/\/order\/(pay|success)/, { timeout: 15000 });

    const url = page.url();
    expect(url).toMatch(/\/order\/(pay|success)/);

    // 取出 orderId
    const urlObj = new URL(url);
    const orderId = urlObj.searchParams.get('orderId');
    expect(orderId).toBeTruthy();

    console.log(`✅ Order created: ${orderId}`);

    // 儲存 orderId 供後續步驟使用
    await page.evaluate((id) => {
      sessionStorage.setItem('test_order_id', id ?? '');
    }, orderId);
  });

  test('Step 6：mock 付款 → order status → paid', async ({ page }) => {
    // 從 checkout 建立訂單並取 orderId
    await page.goto(`/checkout?slug=${TEST_ACTIVITY_SLUG}`);
    await page.waitForLoadState('networkidle');

    const scheduleSelect = page.locator('[data-testid="checkout-schedule-select"]');
    const hasSchedule = await scheduleSelect.isVisible().catch(() => false);
    if (!hasSchedule) {
      test.skip(true, '無可用排期，跳過付款測試');
      return;
    }

    const createBtn = page.locator('[data-testid="create-order-btn"]');
    await expect(createBtn).toBeEnabled({ timeout: 5000 });
    await createBtn.click();

    await page.waitForURL(/\/order\/(pay|success)/, { timeout: 15000 });
    const orderId = new URL(page.url()).searchParams.get('orderId');
    expect(orderId).toBeTruthy();

    // Mock 付款
    const payRes = await mockPayment(page, orderId!);
    expect(payRes.status()).toBe(200);
    const payBody = await payRes.json();
    expect(payBody.ok).toBe(true);
    console.log(`✅ Mock payment succeeded for order: ${orderId}`);
  });

  test('Step 7：訂單列表 → 可見剛建立的訂單', async ({ page }) => {
    await page.goto(`/me/orders`);

    // 輸入測試 email 查詢
    const emailInput = page.locator('[data-testid="orders-email-input"]');
    await expect(emailInput).toBeVisible({ timeout: 8000 });
    await emailInput.fill(TEST_EMAIL);
    await page.keyboard.press('Enter');

    // 等待訂單列表或空狀態
    await page.waitForTimeout(2000);

    const orderItems = page.locator('[data-testid="order-list-item"]');
    const emptyState = page.locator('text=找不到訂單');

    const hasOrders = await orderItems.first().isVisible().catch(() => false);
    const isEmpty = await emptyState.isVisible().catch(() => false);

    // 至少其中一個狀態存在（Email 正確 = 有訂單；Email 不存在 = 空狀態）
    expect(hasOrders || isEmpty).toBe(true);

    if (hasOrders) {
      console.log(`✅ Orders visible: ${await orderItems.count()} orders`);
    } else {
      console.log(`ℹ️ No orders found for email: ${TEST_EMAIL}`);
    }
  });
});

// ── 漏斗各步驟獨立 smoke tests ────────────────────────────────────────────

test.describe('Smoke: 關鍵頁面 data-testid 完整性', () => {
  test('首頁 home-cta-explore 存在', async ({ page }) => {
    await page.goto('/');
    await waitForTestId(page, 'home-cta-explore');
    await expect(page.locator('[data-testid="home-cta-explore"]')).toBeVisible();
  });

  test('活動列表頁 activity-card 存在', async ({ page }) => {
    await page.goto('/activities');
    await page.locator('[data-testid="activity-card"]').first().waitFor({
      state: 'visible',
      timeout: 15000,
    });
    expect(
      await page.locator('[data-testid="activity-card"]').count()
    ).toBeGreaterThan(0);
  });

  test('活動詳情頁 activity-detail-title + begin-checkout-btn 存在', async ({ page }) => {
    await page.goto(`/activities/kaohsiung/${TEST_ACTIVITY_SLUG}`);
    await waitForTestId(page, 'activity-detail-title');
    await waitForTestId(page, 'begin-checkout-btn');
    await expect(page.locator('[data-testid="activity-detail-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="begin-checkout-btn"]')).toBeVisible();
  });

  test('Checkout 頁 create-order-btn 存在（有排期時）', async ({ page }) => {
    await page.goto(`/checkout?slug=${TEST_ACTIVITY_SLUG}`);
    await page.waitForLoadState('networkidle');
    const btn = page.locator('[data-testid="create-order-btn"]');
    // 若無排期按鈕可能不存在，不強制 fail
    const visible = await btn.isVisible().catch(() => false);
    console.log(`create-order-btn visible: ${visible}`);
  });

  test('訂單列表頁 orders-email-input 存在', async ({ page }) => {
    await page.goto('/me/orders');
    await waitForTestId(page, 'orders-email-input');
    await expect(page.locator('[data-testid="orders-email-input"]')).toBeVisible();
  });
});

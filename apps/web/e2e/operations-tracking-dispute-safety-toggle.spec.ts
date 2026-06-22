/**
 * Admin 操作追蹤頁：新增「付款爭議 / 安全事件」兩個 payout-hold toggle
 *（owner 待辦 2026-06-22）。
 *
 * 驗證使用者可見行為：選一筆訂單 → 勾選兩個新 hold → 儲存 → PATCH body 帶
 * isDisputed / isSafetyCase=true。後端 round-trip 由
 * tests/api/operations-tracking-dispute-safety-write.test.mjs 涵蓋。
 *
 * Run: npm run test:e2e -w @tour/web -- e2e/operations-tracking-dispute-safety-toggle.spec.ts
 */
import { test, expect } from './helpers';

const ROW = {
  orderId: 'ord_e2e_hold_001',
  orderDate: '2026-06-01T00:00:00Z',
  guideName: 'guide-x',
  activityName: '柴山祕境洞窟探險',
  scheduleDate: '2026-06-04T00:00:00Z',
  travelers: 2,
  status: 'completed',
  gmv: 2000,
  effectiveGmv: 2000,
  commissionTwd: 300,
  paymentFeeTwd: 50,
  manualMinutes: 0,
  manualCostTwd: 0,
  refundAmountTwd: 0,
  subsidyTwd: 0,
  hasException: false,
  finalContributionTwd: 250,
  isHealthyOrder: true,
  isRescheduled: false,
  hasComplaint: false,
  hasGuideAdjustment: false,
  hasOversellIssue: false,
  isDisputed: false,
  isSafetyCase: false,
  note: null,
};

const SUMMARY = {
  totalOrders: 1,
  totalGmv: 2000,
  totalCommissionTwd: 300,
  avgFinalContributionTwd: 250,
  healthyOrderRate: 100,
  kpiConfig: { commissionRate: 0.15, paymentFeeRate: 0.025, healthyMinContributionTwd: 0, healthyAllowException: false },
};

test('操作追蹤：可勾選付款爭議／安全事件並送出 isDisputed/isSafetyCase', async ({ authedPage: page }) => {
  let patchBody: Record<string, unknown> | null = null;

  await page.route('**/api/admin/operations-tracking/summary**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: SUMMARY }) }),
  );
  await page.route('**/api/admin/operations-tracking', async (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      patchBody = JSON.parse(req.postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ...ROW, isDisputed: true, isSafetyCase: true, hasException: true } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [ROW] }) });
  });

  await page.goto('/admin/operations-tracking');

  // 選一筆訂單
  await page.getByText('柴山祕境洞窟探險').first().click();
  await expect(page.getByText('編輯營運欄位')).toBeVisible();

  // 兩個新 toggle 應出現
  const disputeBox = page.locator('label', { hasText: '付款爭議' }).locator('input[type="checkbox"]');
  const safetyBox = page.locator('label', { hasText: '安全事件' }).locator('input[type="checkbox"]');
  await expect(disputeBox).toBeVisible();
  await expect(safetyBox).toBeVisible();

  await disputeBox.check();
  await safetyBox.check();

  await page.getByRole('button', { name: '儲存變更' }).click();

  await expect.poll(() => patchBody).not.toBeNull();
  expect(patchBody!.isDisputed).toBe(true);
  expect(patchBody!.isSafetyCase).toBe(true);
});

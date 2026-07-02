/**
 * 排程工作流控制台（/admin/go-no-go 內的 CronJobsPanel）。
 *
 * - 使用 e2e/helpers.ts 的 authedPage admin fixture。
 * - page.route() mock /api/admin/cron-jobs 與 /api/admin/go-no-go，
 *   不依賴 Supabase seed。
 * - 驗證：列表渲染（名稱／排程時間／最近結果）、停用開關送出 PATCH
 *   並帶 x-csrf-token。
 */
import { test, expect } from './helpers';

const MOCK_JOBS = {
  ok: true,
  data: {
    jobs: [
      {
        jobKey: 'settlement_sweep',
        nameZh: '出款結算 sweep',
        descriptionZh: 'completed 訂單結算進 payout_items',
        endpoint: '/api/internal/settlement/sweep',
        workflowFile: 'settlement-sweep.yml',
        workflowUrl: 'https://github.com/smallwei0301/tour-platform/actions/workflows/settlement-sweep.yml',
        schedule: '每日 02:00 UTC（10:00 台北）',
        control: { enabled: true, updatedAt: null, updatedBy: null, reason: null },
        recentRuns: [
          {
            outcome: 'success',
            summary: { swept: 3 },
            source: 'schedule',
            started_at: '2026-07-02T02:00:01Z',
            finished_at: '2026-07-02T02:00:05Z',
          },
        ],
      },
      {
        jobKey: 'ecpay_reconcile',
        nameZh: 'ECPay 付款對帳',
        descriptionZh: '對帳 pending ECPay 付款',
        endpoint: '/api/internal/payments/ecpay-reconcile',
        workflowFile: 'ecpay-reconcile.yml',
        workflowUrl: 'https://github.com/smallwei0301/tour-platform/actions/workflows/ecpay-reconcile.yml',
        schedule: '每日 03:30 UTC（11:30 台北）',
        control: { enabled: true, updatedAt: null, updatedBy: null, reason: null },
        recentRuns: [],
      },
    ],
  },
};

test.describe('admin cron jobs panel', () => {
  test('列表渲染結果與開關，停用送出 PATCH 且帶 CSRF header', async ({ authedPage: page }) => {
    let patchBody: Record<string, unknown> | null = null;
    let patchCsrf: string | null = null;

    await page.route('**/api/admin/go-no-go**', (route) =>
      route.fulfill({
        json: {
          ok: true,
          data: {
            readiness: [],
            metrics: { healthyOrderRate: 1, exceptionRate: 0, pendingRefunds: 0, paidConfirmedRatio: 1, incidents24h: 0 },
            verdict: { state: 'GO', reason: 'mock', computedAt: '2026-07-02T00:00:00Z', deploySha: 'mock' },
            recommendedActions: [],
          },
        },
      }),
    );
    await page.route('**/api/admin/cron-jobs**', async (route) => {
      const req = route.request();
      if (req.method() === 'PATCH') {
        patchBody = JSON.parse(req.postData() || '{}');
        patchCsrf = await req.headerValue('x-csrf-token');
        return route.fulfill({
          json: {
            ok: true,
            data: {
              jobKey: 'settlement_sweep',
              control: { enabled: false, updatedAt: '2026-07-02T05:00:00Z', updatedBy: 'admin', reason: null },
            },
          },
        });
      }
      return route.fulfill({ json: MOCK_JOBS });
    });

    await page.goto('/admin/go-no-go');
    const table = page.locator('[data-testid="cron-jobs-table"]');
    await expect(table).toBeVisible();

    // 列表內容：名稱、排程時間、最近結果 badge、無紀錄提示
    const row1 = page.locator('[data-testid="cron-job-row-settlement_sweep"]');
    await expect(row1).toContainText('出款結算 sweep');
    await expect(row1).toContainText('每日 02:00 UTC');
    await expect(row1).toContainText('成功');
    await expect(page.locator('[data-testid="cron-job-row-ecpay_reconcile"]')).toContainText('尚無紀錄');

    // 停用：confirm 對話框 → PATCH 帶 jobKey/enabled 與 CSRF header
    page.on('dialog', (d) => d.accept());
    await page.locator('[data-testid="cron-toggle-settlement_sweep"]').click();
    await expect.poll(() => patchBody).not.toBeNull();
    expect(patchBody).toMatchObject({ jobKey: 'settlement_sweep', enabled: false });
    expect(patchCsrf).toBeTruthy();
  });
});

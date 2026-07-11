import { test, expect } from './helpers';
import type { Page, Route } from '@playwright/test';

const publicBookingAudit = {
  jobKey: 'public-booking-v2-audit',
  labelZh: '公開 Booking V2 稽核',
  summaryZh: '檢查公開 Booking V2 流程與可預約名額。',
  riskLevelZh: '高風險',
  riskReasonZh: '異常時可能影響公開訂位。',
  disableEffectZh: '停用後不再執行稽核通知。',
  workflowName: 'Public Booking V2 Audit',
  workflowFile: 'public-booking-v2-audit.yml',
  workflowUrl: 'https://github.com/smallwei0301/tour-platform/actions/workflows/public-booking-v2-audit.yml',
  scheduleZh: '每日 09:00（台北時間）',
  cron: '0 1 * * *',
  lastRun: {
    startedAt: '2026-07-10T01:00:00.000Z',
    status: 'completed',
    conclusion: 'success',
    conclusionLabelZh: '成功',
    url: 'https://github.com/smallwei0301/tour-platform/actions/runs/1700',
  },
  github: {
    id: 1700,
    name: 'Public Booking V2 Audit',
    state: 'active',
    stateLabelZh: '已啟用',
    enabled: true,
    matched: true,
    canToggle: true,
  },
};

async function installGoNoGoRoutes(page: Page) {
  await page.route('**/api/admin/go-no-go', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          readiness: [],
          metrics: { healthyOrderRate: 100, exceptionRate: 0, pendingRefunds: 0, paidConfirmedRatio: 100, incidents24h: 0 },
          verdict: { state: 'GO', reason: 'All metrics within acceptable thresholds', computedAt: '2026-07-10T00:00:00.000Z', deploySha: '1700-test' },
          recommendedActions: [],
        },
      }),
    });
  });

  await page.route('**/api/admin/cron-jobs', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { jobs: [publicBookingAudit], hasGithubToken: true } }),
    });
  });
}

test('admin 排程管理：390px 使用完整可讀的 workflow card，不顯示桌面表格', async ({ authedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installGoNoGoRoutes(page);

  await page.goto('/admin/go-no-go');
  await expect(page.getByRole('heading', { name: '排程管理' })).toBeVisible();

  const card = page.getByTestId('cron-job-card-public-booking-v2-audit');
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', { name: /Public Booking V2 Audit/ })).toBeVisible();
  await expect(card.getByText('每日 09:00（台北時間）', { exact: true })).toBeVisible();
  await expect(card.getByRole('link', { name: /成功/ })).toBeVisible();
  await expect(card.getByText('高風險', { exact: true })).toBeVisible();
  await expect(card.getByText('已啟用', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: '停用' })).toBeVisible();
  await expect(page.getByTestId('cron-jobs-table')).toBeHidden();

  const overflow = await card.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(false);
});

test('admin 排程管理：desktop 保持既有 table 與 toggle', async ({ authedPage: page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installGoNoGoRoutes(page);

  await page.goto('/admin/go-no-go');
  await expect(page.getByTestId('cron-jobs-table')).toBeVisible();
  await expect(page.getByTestId('cron-job-card-public-booking-v2-audit')).toBeHidden();
  await expect(page.getByTestId('cron-job-row-public-booking-v2-audit')).toBeVisible();
  await expect(page.getByTestId('cron-toggle-public-booking-v2-audit')).toBeVisible();
});

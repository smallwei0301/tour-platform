// apps/web/e2e/midao2-backend-flow.spec.ts
// midao2 後台五頁走查（API 全 mock；驗證 UI 綁定與互動，不驗後端）
import { test, expect, setGuideSession } from './helpers';

const SUMMARY = {
  success: true,
  data: {
    guideName: 'Andy',
    counts: { newRequests: 2, pendingReply: 1 },
    topRequest: {
      id: 'req-1', requestNo: 'R20260815001', travelerName: '王小姐',
      activityTitle: '柴山私人秘境導覽', preferredDate: '2026-08-15', backupDate: '2026-08-16',
      preferredPeriod: 'morning', participantsCount: 4, participantsNote: '含 1 位 8 歲兒童',
      language: '中文', needPickup: false, specialNote: '膝蓋曾受傷',
      travelerLineId: 'wang123', travelerEmail: null, answers: [],
      status: 'new', createdAt: new Date().toISOString(),
    },
    recentRequests: [
      { id: 'req-2', travelerName: '陳先生', status: 'pending_reply', activityTitle: '高雄老城文化導覽' },
      { id: 'req-3', travelerName: 'John', status: 'closed_won', activityTitle: '私人包車一日遊' },
    ],
  },
};

test.beforeEach(async ({ page }) => {
  await setGuideSession(page, 'guide-e2e-1');
  await page.route('**/api/guide/auth/csrf', (r) => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/v2/guide/midao/summary', (r) => r.fulfill({ json: SUMMARY }));
});

test('首頁：統計卡/需要你處理/底部導覽', async ({ page }) => {
  await page.goto('/midao2');
  await expect(page.getByText('Andy')).toBeVisible();
  await expect(page.getByTestId('midao2-stat-new')).toContainText('2');
  await expect(page.getByTestId('midao2-stat-pending')).toContainText('1');
  await expect(page.getByText('王小姐')).toBeVisible();
  await expect(page.getByTestId('midao2-tab-需求')).toBeVisible();
});

test('需求列表→詳情：自動轉待回覆＋radio 更新', async ({ page }) => {
  const detail = { ...SUMMARY.data.topRequest };
  await page.route('**/api/v2/guide/midao/requests*', (r) => r.fulfill({
    json: { success: true, data: { items: [detail], tabCounts: { new: 1, pendingReply: 0, replied: 0, closed: 0 } } },
  }));
  let patched: string[] = [];
  await page.route('**/api/v2/guide/midao/requests/req-1', async (r) => {
    if (r.request().method() === 'PATCH') {
      const body = r.request().postDataJSON();
      patched.push(body.status);
      detail.status = body.status;
      return r.fulfill({ json: { success: true, data: { request: { ...detail } } } });
    }
    return r.fulfill({ json: { success: true, data: { request: { ...detail } } } });
  });
  await page.goto('/midao2/requests');
  await page.getByTestId('midao2-req-card-R20260815001').click();
  await expect(page).toHaveURL(/\/midao2\/requests\/req-1/);
  await expect(page.getByText('#R20260815001')).toBeVisible();
  await expect.poll(() => patched).toContain('pending_reply'); // 開啟詳情自動轉
  await page.getByTestId('midao2-status-closed_won').click();
  await expect.poll(() => patched).toContain('closed_won');
});

test('行事曆：時段開關 PUT', async ({ page }) => {
  const days = Array.from({ length: 31 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    availability: { morning: false, afternoon: true, evening: true, custom: [] },
    hasPending: i === 14, hasConfirmed: i === 16, items: [],
  }));
  await page.route('**/api/v2/guide/midao/calendar*', (r) => r.fulfill({
    json: { success: true, data: { month: '2026-08', days } },
  }));
  let putBody: any = null;
  await page.route('**/api/v2/guide/midao/availability/days/*', (r) => {
    putBody = r.request().postDataJSON();
    return r.fulfill({ json: { success: true, data: { date: 'x', effective: { morning: true, afternoon: true, evening: true, custom: [] } } } });
  });
  await page.goto('/midao2/calendar');
  await page.getByTestId('midao2-cal-day-2026-08-15').click();
  await page.getByTestId('midao2-cal-period-morning').click();
  await expect.poll(() => putBody).toEqual({ morning: true });
});

test('服務列表與精靈第一步驗證', async ({ page }) => {
  await page.route('**/api/v2/guide/midao/services', (r) => r.fulfill({
    json: { success: true, data: { items: [{ activityId: 'act-1', title: '柴山私人秘境導覽', tagline: null, coverImageUrl: null, durationMinutes: 300, minParticipants: 2, maxParticipants: 6, region: '高雄', languages: ['中文'], priceTwd: 4800, dealMode: 'confirm_first', questions: [], showcasePublished: true, mainSiteStatus: 'draft', midaoSortOrder: null }] } },
  }));
  await page.goto('/midao2/services');
  await expect(page.getByText('柴山私人秘境導覽')).toBeVisible();
  await expect(page.getByText('NT$4,800')).toBeVisible();
  await page.getByTestId('midao2-svc-new').click();
  await expect(page).toHaveURL(/\/midao2\/services\/new/);
  await page.getByTestId('midao2-form-next1').click(); // 未填必填 → 停留步驟一並顯示錯誤
  await expect(page).toHaveURL(/\/midao2\/services\/new/);
});

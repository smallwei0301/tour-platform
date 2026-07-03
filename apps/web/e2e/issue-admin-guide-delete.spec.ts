/**
 * Admin 刪除導遊（兩分頁：導遊申請＋已上線導遊）
 *
 * 驗證範圍：
 *  1. 已上線導遊成功刪除流：precheck 顯示活動數 → 確認 → DELETE 帶 CSRF → 列表重載
 *  2. precheck 被擋（有訂單／撥款）：顯示筆數與停權建議、無「永久刪除」鈕、不發 DELETE
 *  3. DELETE 途中被擋（race → 409 GUIDE_HAS_RECORDS）：modal 轉為被擋畫面、列表不重載
 *  4. 導遊申請分頁成功刪除流
 *
 * Backend 全程以 page.route mock（規範見 CLAUDE.md frontend testing policy），
 * 不依賴 Supabase seed。Admin session 用 helpers 的 authedPage fixture。
 */
import { test, expect } from './helpers';
import type { Page, Request as PwRequest } from '@playwright/test';

const GUIDE_ID = 'gp-e2e-0001';
const APP_ID = 'ga-e2e-0001';

const PROFILE_FIXTURE = [{
  id: GUIDE_ID,
  display_name: '測試導遊阿海',
  slug: 'guide-e2e-ahai',
  verification_status: 'approved',
  headline: null,
  region: '屏東縣',
  rating_avg: null,
  guide_email: 'ahai@example.com',
  profile_photo_url: null,
}];

const APPLICATION_FIXTURE = [{
  id: APP_ID,
  fullName: '申請人小美',
  email: 'mei@example.com',
  phone: '0911222333',
  city: '台南市',
  status: 'pending',
  bio: '想成為在地導遊',
  createdAt: '2026-06-01T00:00:00.000Z',
  adminNote: null,
}];

type Counters = { approvedFetches: number; applicationFetches: number; deleteRequests: PwRequest[] };

async function stubGuidesBackend(page: Page, opts: {
  precheck: Record<string, unknown>;
  deleteStatus?: number;
  deleteBody?: Record<string, unknown>;
}): Promise<Counters> {
  const counters: Counters = { approvedFetches: 0, applicationFetches: 0, deleteRequests: [] };

  await page.route('**/api/admin/guide-applications**', async (route) => {
    counters.applicationFetches += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: APPLICATION_FIXTURE }) });
  });
  await page.route('**/api/admin/guides/approved', async (route) => {
    counters.approvedFetches += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: PROFILE_FIXTURE }) });
  });
  await page.route('**/api/admin/guides/*/delete-precheck', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: opts.precheck }) });
  });
  await page.route(`**/api/admin/guides/${GUIDE_ID}`, async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    counters.deleteRequests.push(route.request());
    await route.fulfill({
      status: opts.deleteStatus ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(opts.deleteBody ?? { ok: true, data: { kind: 'profile' } }),
    });
  });
  await page.route(`**/api/admin/guides/${APP_ID}`, async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    counters.deleteRequests.push(route.request());
    await route.fulfill({
      status: opts.deleteStatus ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(opts.deleteBody ?? { ok: true, data: { kind: 'application' } }),
    });
  });

  return counters;
}

test.describe('Admin 刪除導遊', () => {
  test('已上線導遊：precheck 顯示活動數 → 確認刪除 → DELETE 帶 CSRF → 列表重載', async ({ authedPage: page }) => {
    const counters = await stubGuidesBackend(page, {
      precheck: { ok: true, kind: 'profile', displayName: '測試導遊阿海', activityCount: 3, blocked: null },
    });

    await page.goto('/admin/guides');
    await page.getByRole('tab', { name: /已上線導遊/ }).click();
    await expect(page.getByText('測試導遊阿海')).toBeVisible();

    await page.getByRole('button', { name: /刪除帳號/ }).click();
    await expect(page.getByText(/永久刪除/).first()).toBeVisible();
    await expect(page.getByText(/3 個活動/)).toBeVisible();
    await expect(page.getByText(/測試導遊阿海/).nth(1)).toBeVisible();

    const approvedBefore = counters.approvedFetches;
    await page.getByRole('button', { name: '永久刪除' }).click();

    await expect.poll(() => counters.deleteRequests.length).toBe(1);
    const req = counters.deleteRequests[0];
    expect(req.method()).toBe('DELETE');
    expect((await req.headerValue('x-csrf-token')) || '').not.toBe('');

    // 成功後 modal 關閉、列表重載
    await expect(page.getByText('永久刪除')).toHaveCount(0);
    await expect.poll(() => counters.approvedFetches).toBeGreaterThan(approvedBefore);
  });

  test('已上線導遊：precheck 被訂單／撥款擋下 → 顯示筆數＋停權建議、不發 DELETE', async ({ authedPage: page }) => {
    const counters = await stubGuidesBackend(page, {
      precheck: {
        ok: true, kind: 'profile', displayName: '測試導遊阿海', activityCount: 2,
        blocked: { bookings: 2, payouts: 1, payoutItems: 3, experiences: 0 },
      },
    });

    await page.goto('/admin/guides');
    await page.getByRole('tab', { name: /已上線導遊/ }).click();
    await page.getByRole('button', { name: /刪除帳號/ }).click();

    await expect(page.getByText(/無法刪除/)).toBeVisible();
    await expect(page.getByText(/2 筆訂單/)).toBeVisible();
    await expect(page.getByText(/1 筆撥款/)).toBeVisible();
    await expect(page.getByText(/停權帳號/).last()).toBeVisible();
    await expect(page.getByRole('button', { name: '永久刪除' })).toHaveCount(0);

    // ResponsiveModal 標頭的 ✕ 也叫「關閉」（aria-label），取底部的文字按鈕。
    await page.getByRole('button', { name: '關閉' }).last().click();
    expect(counters.deleteRequests.length).toBe(0);
  });

  test('已上線導遊：DELETE 回 409（race）→ modal 轉為被擋畫面、列表不重載', async ({ authedPage: page }) => {
    const counters = await stubGuidesBackend(page, {
      precheck: { ok: true, kind: 'profile', displayName: '測試導遊阿海', activityCount: 0, blocked: null },
      deleteStatus: 409,
      // 與真實 API 一致：errorV2 envelope（success:false）＋ error.counts。
      deleteBody: {
        success: false,
        error: {
          code: 'GUIDE_HAS_RECORDS',
          message: '此導遊已有訂單或撥款紀錄，無法刪除。',
          counts: { bookings: 1, payouts: 0, payoutItems: 0, experiences: 0 },
        },
      },
    });

    await page.goto('/admin/guides');
    await page.getByRole('tab', { name: /已上線導遊/ }).click();
    const approvedBefore = await (async () => counters.approvedFetches)();
    await page.getByRole('button', { name: /刪除帳號/ }).click();
    await page.getByRole('button', { name: '永久刪除' }).click();

    await expect(page.getByText(/無法刪除/)).toBeVisible();
    await expect(page.getByText(/1 筆訂單/)).toBeVisible();
    expect(counters.approvedFetches).toBe(approvedBefore);
  });

  test('導遊申請：刪除申請紀錄 → DELETE 發出、列表重載', async ({ authedPage: page }) => {
    const counters = await stubGuidesBackend(page, {
      precheck: { ok: true, kind: 'application', fullName: '申請人小美', activityCount: 0, blocked: null },
    });

    await page.goto('/admin/guides');
    await expect(page.getByText('申請人小美')).toBeVisible();

    const appFetchesBefore = counters.applicationFetches;
    await page.getByRole('button', { name: /^🗑️ 刪除$/ }).click();
    await expect(page.getByText(/申請紀錄/)).toBeVisible();
    await page.getByRole('button', { name: '永久刪除' }).click();

    await expect.poll(() => counters.deleteRequests.length).toBe(1);
    expect(counters.deleteRequests[0].method()).toBe('DELETE');
    await expect.poll(() => counters.applicationFetches).toBeGreaterThan(appFetchesBefore);
    await expect(page.getByText('永久刪除')).toHaveCount(0);
  });
});

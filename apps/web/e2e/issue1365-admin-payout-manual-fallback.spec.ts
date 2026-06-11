import { test, expect } from './helpers';
import type { Page, Route } from '@playwright/test';

/**
 * Issue #1365 缺口 2 — admin 出款管理手動操作 fallback。
 *
 * Drives the real /admin/payouts page (authedPage = real admin session) with
 * mocked data APIs. Verifies:
 *   1. 導遊結算餘額區塊渲染：含未達門檻導遊 + 門檻標示
 *   2. 手動產生出款單 → POST /generate 帶 guide_id + CSRF → 餘額列轉「已有待出款單」、
 *      出款列表出現 pending
 *   3. pending 取消 → POST /cancel → 狀態變已取消
 */

const G1 = 'guide-1365-aboveth';
const G2 = 'guide-1365-belowth';
const P1 = '1365aaaa-1111-4111-8111-111111111111';

type FakeState = {
  payoutGenerated: boolean;
  payoutCancelled: boolean;
  generatePosts: Array<{ body: Record<string, unknown>; headers: Record<string, string> }>;
  cancelPosts: Array<{ body: Record<string, unknown>; headers: Record<string, string> }>;
};

async function installRoutes(page: Page): Promise<FakeState> {
  const state: FakeState = {
    payoutGenerated: false,
    payoutCancelled: false,
    generatePosts: [],
    cancelPosts: [],
  };

  await page.route('**/api/admin/payouts/balances', async (route: Route) => {
    const balances = [
      {
        guide_id: G1, balance_twd: 8500, last_settled_at: '2026-06-10T00:00:00Z',
        display_name: '阿德導遊', email: 'ade@example.test',
        has_pending_payout: state.payoutGenerated && !state.payoutCancelled,
      },
      {
        guide_id: G2, balance_twd: 3000, last_settled_at: '2026-06-09T00:00:00Z',
        display_name: '小美導遊', email: 'mei@example.test',
        has_pending_payout: false,
      },
    ];
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { balances, min_withdrawal_twd: 5000 } }),
    });
  });

  await page.route('**/api/admin/payouts/generate', async (route: Route) => {
    const req = route.request();
    state.generatePosts.push({ body: (req.postDataJSON() as Record<string, unknown>) ?? {}, headers: req.headers() });
    state.payoutGenerated = true;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { id: P1, guide_id: G1, total_twd: 8500, state: 'pending', skipped: false } }),
    });
  });

  await page.route(`**/api/admin/payouts/${P1}/cancel`, async (route: Route) => {
    const req = route.request();
    state.cancelPosts.push({ body: (req.postDataJSON() as Record<string, unknown>) ?? {}, headers: req.headers() });
    state.payoutCancelled = true;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { id: P1, state: 'cancelled' } }),
    });
  });

  // List endpoint — exact match only ('**/api/admin/payouts' does not catch
  // the /balances or /generate subpaths registered above; first-match wins
  // anyway since later page.route registrations take precedence).
  await page.route('**/api/admin/payouts', async (route: Route) => {
    const rows = state.payoutGenerated
      ? [{
          id: P1, guide_id: G1, total_twd: 8500,
          state: state.payoutCancelled ? 'cancelled' : 'pending',
          confirmed_by: null, confirmed_at: null, transfer_ref: null, notes: null,
          created_at: '2026-06-11T08:00:00Z',
          guide_profiles: { display_name: '阿德導遊', email: 'ade@example.test' },
        }]
      : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: rows }) });
  });

  return state;
}

test('出款管理手動 fallback: 餘額清單（含未達門檻）→ 手動產生出款單 → 取消', async ({ authedPage: page }) => {
  const api = await installRoutes(page);

  await page.goto('/admin/payouts');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: '出款管理' })).toBeVisible();

  // 1. 餘額區塊：兩位導遊都顯示，未達門檻者有標示
  await expect(page.getByRole('heading', { name: '導遊結算餘額' })).toBeVisible();
  await expect(page.getByText('阿德導遊', { exact: true })).toBeVisible();
  await expect(page.getByText('小美導遊', { exact: true })).toBeVisible();
  await expect(page.getByText('NT$8,500')).toBeVisible();
  await expect(page.getByText('NT$3,000')).toBeVisible();
  await expect(page.getByText('達門檻', { exact: true })).toBeVisible();
  await expect(page.getByText('未達門檻（NT$5,000）')).toBeVisible();

  // 出款列表此時是空的（cron 未跑過的真實狀態）
  await expect(page.getByText('目前沒有待出款紀錄 🎉')).toBeVisible();

  // 2. 手動產生出款單（阿德導遊，達門檻）
  const generateButtons = page.getByRole('button', { name: '手動產生出款單' });
  await expect(generateButtons).toHaveCount(2);
  await generateButtons.first().click();

  await expect.poll(() => api.generatePosts.length).toBe(1);
  const genSent = api.generatePosts[0];
  expect(genSent.body.guide_id).toBe(G1);
  expect(genSent.headers['x-csrf-token']).toBeTruthy();

  // 重載後：出款列表出現 pending（含確認/取消按鈕），餘額列轉「已有待出款單」
  await expect(page.getByRole('button', { name: '確認出款' })).toBeVisible();
  await expect(page.getByText('已有待出款單')).toBeVisible();
  await expect(page.getByRole('button', { name: '手動產生出款單' })).toHaveCount(1); // 只剩小美

  // 3. 取消 pending 出款單
  await page.getByRole('button', { name: '取消', exact: true }).click();

  await expect.poll(() => api.cancelPosts.length).toBe(1);
  expect(api.cancelPosts[0].headers['x-csrf-token']).toBeTruthy();

  // 重載後：列表顯示已取消，餘額列重新可手動產生
  await expect(page.getByText('已取消')).toBeVisible();
  await expect(page.getByRole('button', { name: '確認出款' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '手動產生出款單' })).toHaveCount(2);
});

test('出款管理手動 fallback: 重複產生被 409 阻擋並顯示錯誤訊息', async ({ authedPage: page }) => {
  await page.route('**/api/admin/payouts/balances', async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          balances: [{
            guide_id: G1, balance_twd: 8500, last_settled_at: null,
            display_name: '阿德導遊', email: 'ade@example.test', has_pending_payout: false,
          }],
          min_withdrawal_twd: 5000,
        },
      }),
    });
  });
  await page.route('**/api/admin/payouts/generate', async (route: Route) => {
    await route.fulfill({
      status: 409, contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: '該導遊已有待出款記錄，請先處理既有出款單' }),
    });
  });
  await page.route('**/api/admin/payouts', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });

  await page.goto('/admin/payouts');
  await page.getByRole('button', { name: '手動產生出款單' }).click();
  // 兩個 role=alert（錯誤條 + Next.js route announcer）→ 以文字過濾
  await expect(page.getByRole('alert').filter({ hasText: '已有待出款記錄' })).toBeVisible();
});

import { test, expect } from './helpers';
import type { Page, Route } from '@playwright/test';

/**
 * Issue #1360 — admin 出款管理 (/admin/payouts) end-to-end flow with mock data.
 *
 * Drives the real admin payouts page in a browser (authedPage = real admin
 * session) and mocks the data APIs via page.route() so no Supabase / real
 * payout is touched. Verifies the full flow:
 *   list renders → enter transfer ref on a pending payout → 確認出款 →
 *   POST /confirm carries transfer_ref + confirmed_by + CSRF header →
 *   reload shows the payout as 已出款 (state pending → paid).
 */

const P1 = '1360aaaa-1111-4111-8111-111111111111'; // pending → will be confirmed
const P2 = '1360bbbb-2222-4222-8222-222222222222'; // already paid
const P3 = '1360cccc-3333-4333-8333-333333333333'; // cancelled

function payout(id: string, state: string, name: string, amount: number, extra: Record<string, unknown> = {}) {
  return {
    id, guide_id: `guide-${id.slice(0, 8)}`, total_twd: amount, state,
    confirmed_by: null, confirmed_at: null, transfer_ref: null, notes: null,
    created_at: '2026-06-01T08:00:00Z',
    guide_profiles: { display_name: name, email: `${name}@example.test` },
    ...extra,
  };
}

async function installPayoutRoutes(page: Page) {
  let p1Confirmed = false;
  const confirmPosts: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];

  await page.route('**/api/admin/payouts', async (route: Route) => {
    // List endpoint — reflects P1's state after confirmation.
    const rows = [
      p1Confirmed
        ? payout(P1, 'paid', '阿德導遊', 5000, { confirmed_by: 'admin', confirmed_at: '2026-06-02T09:00:00Z', transfer_ref: 'TRX-MOCK-001' })
        : payout(P1, 'pending', '阿德導遊', 5000),
      payout(P2, 'paid', '小美導遊', 3000, { confirmed_by: 'admin', confirmed_at: '2026-05-30T09:00:00Z', transfer_ref: 'TRX-OLD-9' }),
      payout(P3, 'cancelled', '阿龍導遊', 2000),
    ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: rows }) });
  });

  await page.route(`**/api/admin/payouts/${P1}/confirm`, async (route: Route) => {
    const req = route.request();
    confirmPosts.push({ body: (req.postDataJSON() as Record<string, unknown>) ?? {}, headers: req.headers() });
    p1Confirmed = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { id: P1, state: 'paid' } }) });
  });

  return { confirmPosts };
}

test('admin 出款管理: 完整流程 — 列表渲染 → 確認出款 → 狀態變已出款', async ({ authedPage: page }) => {
  const api = await installPayoutRoutes(page);

  await page.goto('/admin/payouts');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: '出款管理' })).toBeVisible();

  // List renders all three mock payouts with names + amounts.
  // (exact: true — the name also appears inside the email cell.)
  await expect(page.getByText('阿德導遊', { exact: true })).toBeVisible();
  await expect(page.getByText('小美導遊', { exact: true })).toBeVisible();
  await expect(page.getByText('阿龍導遊', { exact: true })).toBeVisible();
  await expect(page.getByText('NT$5,000')).toBeVisible();

  // State-specific UI: pending → confirm button; paid → 已出款; cancelled → 已取消.
  const confirmBtn = page.getByRole('button', { name: '確認出款' });
  await expect(confirmBtn).toBeVisible();
  await expect(page.getByText('已出款')).toBeVisible(); // P2
  await expect(page.getByText('已取消')).toBeVisible(); // P3

  // Enter the bank transfer reference on the pending row, then confirm.
  await page.getByPlaceholder('轉帳流水號').fill('TRX-MOCK-001');
  await confirmBtn.click();

  // The confirm request carried transfer_ref + confirmed_by + a CSRF header.
  await expect.poll(() => api.confirmPosts.length).toBe(1);
  const sent = api.confirmPosts[0];
  expect(sent.body.transfer_ref).toBe('TRX-MOCK-001');
  expect(sent.body.confirmed_by).toBe('admin');
  expect(sent.headers['x-csrf-token']).toBeTruthy();

  // After reload the payout shows as 已出款 and the confirm button is gone → flow complete.
  await expect(page.getByRole('button', { name: '確認出款' })).toHaveCount(0);
  await expect(page.getByText('阿德導遊', { exact: true })).toBeVisible();
  await expect(page.getByText('已出款').first()).toBeVisible();
});

test('admin 出款管理: 空列表顯示完成提示', async ({ authedPage: page }) => {
  await page.route('**/api/admin/payouts', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });

  await page.goto('/admin/payouts');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: '出款管理' })).toBeVisible();
  await expect(page.getByText('目前沒有待出款紀錄 🎉')).toBeVisible();
});

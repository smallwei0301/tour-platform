import { test, expect, setGuideSession } from './helpers';

// #1497 — 導遊「幫手確認」頁：列出需幫手的例外加開時段，確認後離開清單。
const GUIDE_ID = '11111111-1111-1111-1111-111111111111';
const OVERRIDE_ID = '22222222-2222-2222-2222-222222222222';

const OVERRIDE = {
  id: OVERRIDE_ID,
  activityId: '33333333-3333-3333-3333-333333333333',
  activityPlanId: '44444444-4444-4444-4444-444444444444',
  activityTitle: '無人島一日探險',
  startAt: '2030-07-06T01:00:00+08:00',
  endAt: '2030-07-06T09:00:00+08:00',
  reason: '找到幫手，例外加開全日方案',
  requiresHelper: true,
  helperStatus: 'required',
  guideNote: '請與李小幫協調',
  createdAt: '2030-06-01T00:00:00+08:00',
};

test.describe('guide conflict-override helper confirmation', () => {
  test('lists the override and confirms a helper', async ({ page }) => {
    await setGuideSession(page, GUIDE_ID);

    let listCalls = 0;
    await page.route('**/api/guide/conflict-overrides', async (route) => {
      listCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { overrides: [OVERRIDE] } }),
      });
    });
    await page.route(`**/api/guide/conflict-overrides/${OVERRIDE_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { override: { id: OVERRIDE_ID, helper_status: 'assigned' } } }),
      });
    });

    await page.goto('/guide/conflict-overrides');

    const card = page.getByTestId('conflict-override-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('無人島一日探險');
    await expect(card).toContainText('找到幫手，例外加開全日方案');
    await expect(card).toContainText('請與李小幫協調');
    expect(listCalls).toBeGreaterThan(0);

    await page.getByRole('button', { name: /已安排幫手，確認/ }).click();

    // 表態後該筆離開清單 → 顯示空狀態。
    await expect(page.getByTestId('conflict-override-empty')).toBeVisible();
  });
});

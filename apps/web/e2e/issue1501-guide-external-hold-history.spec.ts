import { test, expect, setGuideSession } from './helpers';

// issue #1501 — 導遊端外部佔位彙總 + 登記/釋放歷史面板。
// 後端全程以 page.route 攔截，不依賴 Supabase。

const GUIDE_ID = '11111111-1111-1111-1111-111111111111';
const SCHEDULE_ID = '22222222-2222-2222-2222-222222222222';

function futureIso(daysAhead: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

test('導遊外部佔位彙總顯示，並可展開登記/釋放歷史', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);

  await page.route('**/api/guide/auth/csrf**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  );

  await page.route('**/api/guide/schedules', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: [{
          id: SCHEDULE_ID, activityId: '33333333-3333-3333-3333-333333333333',
          tourTitle: '蘭嶼夜觀角鴞', planName: '半日', date: futureIso(7), endAt: futureIso(7, 12),
          capacity: 10, bookedCount: 5, externalHoldCount: 3,
          externalHolds: [{ id: 'h1', participants: 3, note: 'KKday' }],
          status: 'open', guideNote: null,
        }],
      }),
    }),
  );

  let historyHit = 0;
  await page.route('**/api/guide/external-holds/history**', (route) => {
    historyHit += 1;
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: [
          { id: 'log1', action: 'created', participants: 3, scheduleId: SCHEDULE_ID, note: 'KKday', createdAt: '2026-06-25T02:00:00Z' },
          { id: 'log2', action: 'released', participants: 2, scheduleId: SCHEDULE_ID, note: null, createdAt: '2026-06-24T08:00:00Z' },
        ],
      }),
    });
  });

  await page.goto('/guide/schedules');

  // 彙總：總人數 3、1 個場次
  const summary = page.getByTestId('external-hold-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('目前共 3 人');
  await expect(summary).toContainText('1 個場次');

  // 歷史預設不載入；點擊後才 fetch
  expect(historyHit).toBe(0);
  await page.getByTestId('external-hold-history-toggle').click();

  const history = page.getByTestId('external-hold-history');
  await expect(history).toBeVisible();
  await expect(history).toContainText('＋ 登記');
  await expect(history).toContainText('－ 釋放');
  await expect(history).toContainText('KKday');
  expect(historyHit).toBeGreaterThan(0);
});

import { test, expect, setGuideSession } from './helpers';

// 導遊後台「外部佔位」E2E：登記後名額同步反映、可釋放。
// 後端全程以 page.route 攔截，不依賴 Supabase seed。

const GUIDE_ID = '11111111-1111-1111-1111-111111111111';
const SCHEDULE_ID = '22222222-2222-2222-2222-222222222222';

function futureIso(daysAhead: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

test('guide can register an external hold and see remaining capacity drop', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);

  // 可變狀態：登記後 GET 會反映新的 booked_count / externalHolds
  const state = {
    bookedCount: 2,
    externalHolds: [] as Array<{ id: string; participants: number; note: string | null }>,
  };

  await page.route('**/api/guide/auth/csrf**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  );

  await page.route('**/api/guide/schedules', (route) => {
    const externalHoldCount = state.externalHolds.reduce((s, h) => s + h.participants, 0);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: SCHEDULE_ID,
            activityId: '33333333-3333-3333-3333-333333333333',
            tourTitle: '蘭嶼夜觀角鴞',
            planName: '半日',
            date: futureIso(7),
            endAt: futureIso(7, 12),
            capacity: 10,
            bookedCount: state.bookedCount,
            externalHoldCount,
            externalHolds: state.externalHolds,
            status: 'open',
            guideNote: null,
          },
        ],
      }),
    });
  });

  await page.route(`**/api/guide/schedules/${SCHEDULE_ID}/external-holds`, (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = JSON.parse(route.request().postData() || '{}');
    const participants = Number(body.participants) || 0;
    const holdId = '44444444-4444-4444-4444-444444444444';
    state.bookedCount += participants;
    state.externalHolds.push({ id: holdId, participants, note: null });
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { holdId, participants, bookedCount: state.bookedCount, remaining: 10 - state.bookedCount } }),
    });
  });

  await page.goto('/guide/schedules');

  // 初始：已訂 2/10，外部佔位為 —
  await expect(page.getByText('蘭嶼夜觀角鴞')).toBeVisible();
  await expect(page.getByText('2', { exact: false })).toBeVisible();

  // 登記 3 位外部佔位
  await page.getByRole('button', { name: '＋ 登記' }).click();
  await page.getByPlaceholder('人數').fill('3');
  await page.getByRole('button', { name: '✓' }).click();

  // 重新載入後：外部佔位顯示 🔒 3 人，已訂變 5/10
  await expect(page.getByText('🔒 3 人')).toBeVisible();
  await expect(page.getByText('5', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '釋放' })).toBeVisible();
});

test('guide can release an external hold', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);

  const holdId = '44444444-4444-4444-4444-444444444444';
  const state = {
    bookedCount: 5,
    externalHolds: [{ id: holdId, participants: 3, note: null }] as Array<{ id: string; participants: number; note: string | null }>,
  };

  await page.route('**/api/guide/auth/csrf**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  );

  await page.route('**/api/guide/schedules', (route) => {
    const externalHoldCount = state.externalHolds.reduce((s, h) => s + h.participants, 0);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: SCHEDULE_ID,
            activityId: '33333333-3333-3333-3333-333333333333',
            tourTitle: '蘭嶼夜觀角鴞',
            planName: '半日',
            date: futureIso(7),
            endAt: futureIso(7, 12),
            capacity: 10,
            bookedCount: state.bookedCount,
            externalHoldCount,
            externalHolds: state.externalHolds,
            status: 'open',
            guideNote: null,
          },
        ],
      }),
    });
  });

  await page.route(`**/api/guide/schedules/${SCHEDULE_ID}/external-holds/${holdId}`, (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    state.bookedCount -= 3;
    state.externalHolds = [];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { released: true, holdId } }) });
  });

  // 自動接受 confirm 對話框
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/guide/schedules');
  await expect(page.getByText('🔒 3 人')).toBeVisible();

  await page.getByRole('button', { name: '釋放' }).click();

  // 釋放後外部佔位歸零
  await expect(page.getByText('🔒 3 人')).toHaveCount(0);
  await expect(page.getByText('—', { exact: false }).first()).toBeVisible();
});

// apps/web/e2e/midao2-calendar-canonical.spec.ts
// #1760 Stage 2：/midao2/calendar canonical 可用性（API 全 mock）。
// 覆蓋：月/日投影、U-1 段別、自訂時段、過期 revision 409 重新載入與提示、W-2 週批次。
import { test, expect, setGuideSession } from './helpers';

const TZ = 'Asia/Taipei';
const MONTH = '2026-09';

function buildDays(overrides: Record<string, any> = {}) {
  return Array.from({ length: 30 }, (_, i) => {
    const date = `${MONTH}-${String(i + 1).padStart(2, '0')}`;
    return {
      date,
      availability: { morning: false, afternoon: false, evening: false, custom: [] },
      ranges: [],
      revision: 0,
      isClosed: false,
      timezone: TZ,
      hasPending: false,
      hasConfirmed: false,
      items: [],
      ...(overrides[date] ?? {}),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await setGuideSession(page, 'guide-e2e-1760');
  await page.route('**/api/guide/auth/csrf', (r) => r.fulfill({ json: { ok: true } }));
});

test('月投影：canonical ranges 投影成 U-1 段別按鈕狀態', async ({ page }) => {
  const days = buildDays({
    [`${MONTH}-05`]: {
      availability: { morning: true, afternoon: false, evening: false, custom: [] },
      ranges: [{ startTimeLocal: '09:00', endTimeLocal: '12:00' }],
      revision: 2,
    },
  });
  await page.route('**/api/v2/guide/midao/calendar*', (r) =>
    r.fulfill({ json: { success: true, data: { month: MONTH, days } } }),
  );
  await page.goto('/midao2/calendar');
  await page.getByTestId('midao2-cal-prev').click();
  await page.getByTestId('midao2-cal-day-2026-09-05').click();
  await expect(page.getByTestId('midao2-cal-period-morning')).toBeVisible();
  await expect(page.getByTestId('midao2-cal-period-afternoon')).toBeVisible();
});

test('單日寫入：帶 expectedRevision 與 Idempotency-Key 的 canonical CAS', async ({ page }) => {
  const days = buildDays({ [`${MONTH}-05`]: { revision: 7 } });
  await page.route('**/api/v2/guide/midao/calendar*', (r) =>
    r.fulfill({ json: { success: true, data: { month: MONTH, days } } }),
  );
  let putBody: any = null;
  let idemKey: string | null = null;
  await page.route('**/api/v2/guide/midao/availability/days/*', (r) => {
    putBody = r.request().postDataJSON();
    idemKey = r.request().headers()['idempotency-key'] ?? null;
    return r.fulfill({
      json: {
        success: true,
        data: {
          date: `${MONTH}-05`, revision: 8, isClosed: false,
          ranges: [{ startTimeLocal: '13:00', endTimeLocal: '17:00' }], effective: null,
        },
      },
    });
  });
  await page.goto('/midao2/calendar');
  await page.getByTestId('midao2-cal-prev').click();
  await page.getByTestId('midao2-cal-day-2026-09-05').click();
  await page.getByTestId('midao2-cal-period-afternoon').click();
  await expect.poll(() => putBody?.expectedRevision).toBe(7);
  await expect.poll(() => putBody?.ranges).toEqual([{ startTimeLocal: '13:00', endTimeLocal: '17:00' }]);
  await expect.poll(() => idemKey).not.toBeNull();
});

test('自訂時段：送出 canonical 區間並與 U-1 段別合併', async ({ page }) => {
  const days = buildDays({
    [`${MONTH}-05`]: {
      availability: { morning: true, afternoon: false, evening: false, custom: [] },
      ranges: [{ startTimeLocal: '09:00', endTimeLocal: '12:00' }],
      revision: 1,
    },
  });
  await page.route('**/api/v2/guide/midao/calendar*', (r) =>
    r.fulfill({ json: { success: true, data: { month: MONTH, days } } }),
  );
  let putBody: any = null;
  await page.route('**/api/v2/guide/midao/availability/days/*', (r) => {
    putBody = r.request().postDataJSON();
    return r.fulfill({ json: { success: true, data: { date: `${MONTH}-05`, revision: 2, isClosed: false, ranges: [], effective: null } } });
  });
  await page.goto('/midao2/calendar');
  await page.getByTestId('midao2-cal-prev').click();
  await page.getByTestId('midao2-cal-day-2026-09-05').click();
  await page.getByTestId('midao2-cal-custom-add').click();
  await page.locator('input[type="time"]').first().fill('07:00');
  await page.locator('input[type="time"]').nth(1).fill('08:00');
  await page.getByTestId('midao2-cal-custom-confirm').click();
  await expect.poll(() => putBody?.ranges).toEqual([
    { startTimeLocal: '07:00', endTimeLocal: '08:00' },
    { startTimeLocal: '09:00', endTimeLocal: '12:00' },
  ]);
});

test('過期 revision：409 後重新載入並顯示提示訊息', async ({ page }) => {
  let calendarCalls = 0;
  await page.route('**/api/v2/guide/midao/calendar*', (r) => {
    calendarCalls += 1;
    const revision = calendarCalls > 1 ? 9 : 1;
    return r.fulfill({
      json: { success: true, data: { month: MONTH, days: buildDays({ [`${MONTH}-05`]: { revision } }) } },
    });
  });
  await page.route('**/api/v2/guide/midao/availability/days/*', (r) =>
    r.fulfill({
      status: 409,
      json: {
        success: false,
        error: { code: 'REVISION_CONFLICT', message: '此日期已被其他更新覆蓋，請重新載入後再試' },
        currentRevision: 9,
      },
    }),
  );
  await page.goto('/midao2/calendar');
  await page.getByTestId('midao2-cal-prev').click();
  await page.getByTestId('midao2-cal-day-2026-09-05').click();
  await page.getByTestId('midao2-cal-period-morning').click();
  await expect(page.getByTestId('midao2-cal-avail-error')).toContainText('已重新載入');
  await expect.poll(() => calendarCalls).toBeGreaterThan(1);
});

test('W-2 週批次：勾選段別後展開為單日 canonical 寫入', async ({ page }) => {
  await page.route('**/api/v2/guide/midao/calendar*', (r) =>
    r.fulfill({ json: { success: true, data: { month: MONTH, days: buildDays() } } }),
  );
  await page.route('**/api/v2/guide/midao/availability/defaults*', async (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      return r.fulfill({ json: { success: true, data: { month: body.month, applied: body.days, conflicts: [] } } });
    }
    return r.fulfill({
      json: {
        success: true,
        data: {
          month: MONTH,
          weekdays: Array.from({ length: 7 }, (_, weekday) => ({
            weekday, morning: false, afternoon: false, evening: false,
          })),
        },
      },
    });
  });
  let postBody: any = null;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/availability/defaults')) {
      postBody = req.postDataJSON();
    }
  });
  await page.goto('/midao2/calendar');
  await page.getByTestId('midao2-cal-prev').click();
  await page.getByTestId('midao2-cal-defaults-btn').click();
  await page.getByTestId('midao2-default-6-morning').check();
  await page.getByTestId('midao2-defaults-save').click();
  await expect.poll(() => postBody?.month).toBe(MONTH);
  await expect.poll(() => Array.isArray(postBody?.days) && postBody.days.length).toBeTruthy();
  await expect.poll(() => postBody?.days?.[0]).toHaveProperty('expectedRevision');
});

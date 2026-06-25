import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

/**
 * issue #1501 — admin 外部佔位（external_hold）清單頁。
 *
 * 後端以 page.route mock，驗證：
 *   1. 「非營收」說明橫幅呈現。
 *   2. 外部佔位清單呈現活動、人數（🔒 N 人）。
 *   3. API 失敗 → 錯誤橫幅＋重試。
 */

const HOLDS = [
  { holdId: 'H1', participants: 3, note: 'KKday 已售', scheduleId: 'S1', activityId: 'A1', activityTitle: '蘭嶼夜觀角鴞', guideId: 'G1', scheduleStartAt: '2026-07-01T01:00:00Z', capacity: 10, bookedCount: 5, createdAt: '2026-06-25T02:00:00Z' },
  { holdId: 'H2', participants: 2, note: null, scheduleId: 'S2', activityId: 'A2', activityTitle: '高雄柴山探洞', guideId: 'G1', scheduleStartAt: '2026-07-02T01:00:00Z', capacity: 8, bookedCount: 8, createdAt: '2026-06-25T03:00:00Z' },
];

test('admin 外部佔位清單：非營收橫幅 + 佔位明細', async ({ authedPage: page }) => {
  await page.route('**/api/admin/external-holds**', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: HOLDS }) }),
  );

  await page.goto('/admin/external-holds');

  const note = page.getByTestId('external-hold-revenue-note');
  await expect(note).toBeVisible({ timeout: 20_000 });
  await expect(note).toContainText('不計入營收與結算');

  await expect(page.getByText('蘭嶼夜觀角鴞').first()).toBeVisible();
  await expect(page.getByText('高雄柴山探洞').first()).toBeVisible();
  const counts = page.getByTestId('external-hold-participants');
  await expect(counts.filter({ hasText: '3 人' }).first()).toBeVisible();
  await expect(counts.filter({ hasText: '2 人' }).first()).toBeVisible();
});

test('admin 外部佔位清單：API 失敗 → 錯誤橫幅＋重試', async ({ authedPage: page }) => {
  let failNext = true;
  await page.route('**/api/admin/external-holds**', (r: Route) => {
    if (failNext) {
      return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: 'boom' } }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: HOLDS }) });
  });

  await page.goto('/admin/external-holds');
  const banner = page.getByTestId('admin-external-holds-load-error');
  await expect(banner).toBeVisible({ timeout: 20_000 });

  failNext = false;
  await page.getByRole('button', { name: '重試' }).click();
  await expect(page.getByText('蘭嶼夜觀角鴞').first()).toBeVisible({ timeout: 15_000 });
  await expect(banner).toHaveCount(0);
});

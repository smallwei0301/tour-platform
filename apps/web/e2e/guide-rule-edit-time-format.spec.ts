import { test, expect, setGuideSession } from './helpers';
import type { Page, Route } from '@playwright/test';

/**
 * 導遊時段規則「編輯既有規則」時間格式 round-trip 回歸。
 *
 * 原始 bug：guide_availability_rules.start_time_local / end_time_local 是
 * Postgres `time`，讀回帶秒（"09:00:00"）。卡片顯示 "09:00:00-17:00:00"，
 * 編輯框把 "17:00:00" 灌進 <input type="time"> 顯示錯亂，儲存又被自家
 * API 以「Invalid start_time_local」打回。
 *
 * 本 spec 以「GET 故意回傳帶秒資料」模擬既有/快取資料，驗證：
 *   1. 卡片顯示 09:00-17:00（不帶秒）。
 *   2. 編輯框 time input 正確帶入 09:00 / 17:00。
 *   3. 儲存送出的 PUT payload 為 HH:MM，且請求成功、無錯誤訊息。
 */

test.describe.configure({ timeout: 90_000 });

const GUIDE_ID = 'aaaa1307-1111-4111-8111-1111111111aa';
const ACTIVITY_ID = 'bbbb1307-2222-4222-8222-2222222222bb';
const PLAN_ID = 'cccc1307-3333-4333-8333-3333333333cc';
const RULE_ID = 'dddd1307-4444-4444-8444-4444444444dd';

const ACTIVITIES_WITH_PLANS = {
  ok: true,
  data: [
    {
      activityId: ACTIVITY_ID,
      activityTitle: '柴山秘境之旅',
      planId: PLAN_ID,
      planName: 'A. 早鳥半日探秘',
      durationMinutes: 240,
      minParticipants: 1,
      maxParticipants: 10,
      isYearRound: false,
      activeSeasonSummaries: [],
    },
  ],
};

// GET 回傳帶秒的 time（模擬 Postgres `time` 原始值 / 舊資料）。
const RULE_WITH_SECONDS = {
  id: RULE_ID,
  guide_id: GUIDE_ID,
  activity_plan_id: PLAN_ID,
  weekday: 1,
  start_time_local: '09:00:00',
  end_time_local: '17:00:00',
  timezone: 'Asia/Taipei',
  slot_interval_minutes: 240,
  buffer_before_minutes: 15,
  buffer_after_minutes: 15,
  effective_from: '2026-06-01',
  effective_to: '2026-07-31',
  is_active: true,
  use_dynamic_reemit: false,
  activity_plans: { id: PLAN_ID, name: 'A. 早鳥半日探秘' },
};

const J = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function installGuideRoutes(page: Page, onPut: (payload: Record<string, unknown>) => void) {
  await page.route('**/api/guide/auth/csrf', (r: Route) => r.fulfill(J({ ok: true, data: { csrfToken: 'test-csrf' } })));
  await page.route('**/api/guide/availability-rules', (r: Route) =>
    r.fulfill(J({ ok: true, data: { rules: [RULE_WITH_SECONDS] } })),
  );
  await page.route('**/api/guide/blackout-dates', (r: Route) => r.fulfill(J({ ok: true, data: { blackouts: [] } })));
  await page.route('**/api/guide/activities-with-plans', (r: Route) => r.fulfill(J(ACTIVITIES_WITH_PLANS)));
  await page.route('**/api/guide/availability-preview**', (r: Route) =>
    r.fulfill(J({ ok: true, data: { availabilitySource: 'canonical_slot_generator', previewReasonCode: 'LEGACY_FALLBACK_NO_PLAN', previewCanonicalState: 'available', isYearRound: false, activeSeasonSummaries: [], slots: [] } })),
  );
  await page.route(`**/api/guide/availability-rules/${RULE_ID}`, (r: Route) => {
    if (r.request().method() === 'PUT') {
      onPut(r.request().postDataJSON() as Record<string, unknown>);
      return r.fulfill(J({ ok: true, data: { rule: { ...RULE_WITH_SECONDS, start_time_local: '09:00', end_time_local: '18:00' } } }));
    }
    return r.fallback();
  });
}

test('編輯既有規則：帶秒時間正確顯示 HH:MM 且可成功儲存', async ({ page }) => {
  let putPayload: Record<string, unknown> | null = null;
  await setGuideSession(page, GUIDE_ID);
  await installGuideRoutes(page, (p) => { putPayload = p; });

  await page.goto('/guide/availability');
  await page.waitForLoadState('domcontentloaded');

  // 1. 卡片顯示不帶秒。
  await expect(page.getByText('09:00-17:00').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('09:00:00-17:00:00')).toHaveCount(0);

  // 2. 開啟編輯框，time input 帶入正確 HH:MM。
  await page.getByRole('button', { name: '編輯' }).first().click();
  const dialog = page.getByRole('dialog', { name: '編輯時段規則' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#avail-start-time')).toHaveValue('09:00');
  await expect(page.locator('#avail-end-time')).toHaveValue('17:00');

  // 3. 調整結束時間後儲存：請求成功、無錯誤、payload 為 HH:MM。
  await page.locator('#avail-end-time').fill('18:00');
  await dialog.getByRole('button', { name: '儲存' }).click();

  await expect.poll(() => putPayload).not.toBeNull();
  expect(putPayload!.start_time_local).toBe('09:00');
  expect(putPayload!.end_time_local).toBe('18:00');

  // 不得出現任何時間格式錯誤文案。
  await expect(page.getByText(/格式不正確/)).toHaveCount(0);
  await expect(dialog).toBeHidden({ timeout: 10_000 });
});

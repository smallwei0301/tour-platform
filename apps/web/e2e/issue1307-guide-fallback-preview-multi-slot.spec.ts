import { test, expect, setGuideSession } from './helpers';
import type { Page, Route } from '@playwright/test';

/**
 * Issue #1307 follow-up — guide 後台「時段預覽」預設（全部方案/未選方案）
 * 視圖必須渲染 fallback 路徑回傳的多日多時段，並標示成團人數。
 *
 * 根因在後端（fallback 路徑把 plan-bound 規則全數丟棄，預設預覽永遠 0
 * slots），已由 tests/api/issue1307-fallback-plan-bound-rules.test.mjs 以
 * TDD 修復鎖定。本 spec 鎖 UI 縫隙：當 API 以 fallback 形狀
 * （previewReasonCode=LEGACY_FALLBACK_NO_PLAN、slots 帶 minParticipants）
 * 回傳時，頁面必須依日期分組渲染全部時段 chip，不得顯示
 * 「此期間無可用時段」。
 *
 * Backend mocked via page.route（無 Supabase seed）；guide surface 使用
 * format-valid guide session（helpers.setGuideSession），不打真實 HMAC API。
 */

test.describe.configure({ timeout: 90_000 });

const GUIDE_ID = '1307aaaa-1111-4111-8111-111111111111';
const ACTIVITY_ID = '1307bbbb-2222-4222-8222-222222222222';
const PLAN_ID = '1307cccc-3333-4333-8333-333333333333';

const ACTIVITIES_WITH_PLANS = {
  ok: true,
  data: [
    {
      activityId: ACTIVITY_ID,
      activityTitle: '全日深度探秘',
      planId: PLAN_ID,
      planName: 'B. 全日深度探秘',
      durationMinutes: 60,
      minParticipants: 2,
      maxParticipants: 10,
      isYearRound: true,
      activeSeasonSummaries: [],
    },
  ],
};

const BOUND_RULE = {
  id: 'rule-1307-1',
  guide_id: GUIDE_ID,
  activity_plan_id: PLAN_ID,
  weekday: 1,
  start_time_local: '09:00',
  end_time_local: '20:00',
  timezone: 'Asia/Taipei',
  slot_interval_minutes: 60,
  buffer_before_minutes: 15,
  buffer_after_minutes: 15,
  effective_from: '2026-06-01',
  effective_to: '2026-07-31',
  is_active: true,
  use_dynamic_reemit: false,
  activity_plans: { id: PLAN_ID, name: 'B. 全日深度探秘' },
};

type PreviewSlotPayload = { startAt: string; endAt: string; minParticipants: number | null };

function fallbackPreviewBody(slots: PreviewSlotPayload[]) {
  return {
    ok: true,
    data: {
      guide: { id: GUIDE_ID, display_name: '測試導遊' },
      timezone: 'Asia/Taipei',
      activityPlanId: null,
      availabilitySource: 'canonical_slot_generator',
      previewReasonCode: 'LEGACY_FALLBACK_NO_PLAN',
      previewCanonicalState: 'available',
      previewSeasonGate: 'in_active_season',
      isYearRound: true,
      activeSeasonSummaries: [],
      rulesCount: 1,
      blackoutsCount: 0,
      activeBookingsCount: 0,
      slots: slots.map((s) => ({
        ...s,
        isAvailable: true,
        capacityLeft: 8,
        bookingType: 'scheduled',
        activityPlanId: PLAN_ID,
      })),
    },
  };
}

async function installGuideRoutes(page: Page, previewSlots: PreviewSlotPayload[]) {
  await page.route('**/api/guide/auth/csrf', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { csrfToken: 'test-csrf' } }) }),
  );
  await page.route('**/api/guide/availability-rules', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { rules: [BOUND_RULE] } }) }),
  );
  await page.route('**/api/guide/blackout-dates', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { blackouts: [] } }) }),
  );
  await page.route('**/api/guide/activities-with-plans', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACTIVITIES_WITH_PLANS) }),
  );
  await page.route('**/api/guide/availability-preview**', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fallbackPreviewBody(previewSlots)) }),
  );
}

test('預設（全部方案）預覽渲染 fallback 多日多時段 chip，並標示成團人數', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await installGuideRoutes(page, [
    { startAt: '2026-06-15T09:00:00+08:00', endAt: '2026-06-15T10:00:00+08:00', minParticipants: 2 },
    { startAt: '2026-06-15T10:00:00+08:00', endAt: '2026-06-15T11:00:00+08:00', minParticipants: 2 },
    { startAt: '2026-06-22T09:00:00+08:00', endAt: '2026-06-22T10:00:00+08:00', minParticipants: 2 },
  ]);

  await page.goto('/guide/availability');
  await page.waitForLoadState('domcontentloaded');

  // 方案篩選保持預設「全部方案（不篩選）」— 正是先前壞掉的 fallback 視圖。
  await expect(page.getByLabel('篩選方案')).toHaveValue('');

  // 兩個日期分組都渲染。
  await expect(page.getByText('2026-06-15 (一)')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('2026-06-22 (一)')).toBeVisible();

  // 全部時段 chip 都在（完整 startAt–endAt range，Asia/Taipei，無 #1288 位移）。
  await expect(page.getByText('09:00 – 10:00・2人成團')).toHaveCount(2);
  await expect(page.getByText('10:00 – 11:00・2人成團')).toHaveCount(1);
  await expect(page.getByText('17:00 – 18:00')).toHaveCount(0);

  // 不得再顯示空狀態。
  await expect(page.getByText('此期間無可用時段')).toHaveCount(0);
});

test('真正無時段時空狀態不回歸', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await installGuideRoutes(page, []);

  await page.goto('/guide/availability');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByText('此期間無可用時段').first()).toBeVisible({ timeout: 20_000 });
});

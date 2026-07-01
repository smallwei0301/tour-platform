/**
 * 排程 vs 即時 預約「可用時間來源」嚴格區隔 — PR3 預覽正確性（前端）
 *
 * 排程方案的時段預覽不跑動態規則，改顯示提示（data-testid="preview-scheduled-notice"）
 * 引導去「場次管理」。admin 與 guide 預覽區皆需如此。
 *
 * 後端短路合約見 tests/api/scheduled-preview-notice.test.mjs。
 */

import { test, expect, setGuideSession } from './helpers';

const GUIDE_ID = '99999999-9999-9999-9999-0000000000b2';
const ACTIVITY_ID = '11111111-1111-1111-1111-0000000000b2';
const SCHEDULED_PLAN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-0000000000b2';

const SCHEDULED_NOTICE =
  '此方案為排程預約，僅使用固定場次，請至「場次管理」檢視固定場次；此處不套用動態可預約時段規則。';

// ── Admin ──

const ADMIN_ACTIVITIES = {
  success: true,
  data: {
    activities: [
      {
        id: ACTIVITY_ID,
        title: '秘島排程行程',
        slug: 'midao-scheduled',
        plans: [
          { id: SCHEDULED_PLAN_ID, name: '排程方案', status: 'active', booking_type: 'scheduled', base_price: 1800, min_participants: 1, max_participants: 8 },
        ],
      },
    ],
  },
};

const ADMIN_SCHEDULED_PREVIEW = {
  success: true,
  data: {
    guide: { id: GUIDE_ID, display_name: '測試導遊' },
    timezone: 'Asia/Taipei',
    activityPlanId: SCHEDULED_PLAN_ID,
    previewBookingType: 'scheduled',
    previewNotice: SCHEDULED_NOTICE,
    previewCanonicalState: null,
    previewSeasonGate: null,
    isYearRound: true,
    activeSeasonSummaries: [],
    slots: [],
  },
};

test('admin：預覽排程方案 → 顯示提示、不跑動態時段', async ({ authedPage: page }) => {
  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/activity-plans`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ACTIVITIES) }),
  );
  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-rules`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { rules: [] } }) }),
  );
  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/blackout-dates`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { blackouts: [] } }) }),
  );
  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-preview**`, (route) => {
    const url = route.request().url();
    const body = url.includes(SCHEDULED_PLAN_ID)
      ? ADMIN_SCHEDULED_PREVIEW
      : { success: true, data: { guide: { id: GUIDE_ID, display_name: '測試導遊' }, timezone: 'Asia/Taipei', slots: [] } };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto(`/admin/guides/${GUIDE_ID}/availability`);
  await page.waitForLoadState('domcontentloaded');

  await page.locator('select[aria-label="預覽方案篩選"]').selectOption(SCHEDULED_PLAN_ID);
  await page.locator('button:has-text("更新預覽")').click();

  await expect(page.getByTestId('preview-scheduled-notice')).toBeVisible();
  await expect(page.getByTestId('preview-scheduled-notice')).toContainText('場次管理');
});

// ── Guide ──

const GUIDE_PLANS = [
  { activityId: ACTIVITY_ID, activityTitle: '秘島排程行程', activitySlug: 'midao-scheduled', planId: SCHEDULED_PLAN_ID, planName: '排程方案', durationMinutes: 240, bookingType: 'scheduled', minParticipants: 1, maxParticipants: 8, isYearRound: true, activeSeasonSummaries: [] },
];

const GUIDE_SCHEDULED_PREVIEW = {
  ok: true,
  data: {
    guide: { id: GUIDE_ID, display_name: '測試導遊' },
    timezone: 'Asia/Taipei',
    activityPlanId: SCHEDULED_PLAN_ID,
    availabilitySource: 'scheduled_plan_notice',
    previewReasonCode: 'SCHEDULED_PLAN_USES_FIXED_SESSIONS',
    previewBookingType: 'scheduled',
    previewNotice: SCHEDULED_NOTICE,
    previewCanonicalState: null,
    previewSeasonGate: null,
    isYearRound: true,
    activeSeasonSummaries: [],
    slots: [],
  },
};

test('guide：預覽排程方案 → 顯示提示、不跑動態時段', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await page.route('**/api/guide/auth/csrf', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  );
  await page.route('**/api/guide/activities-with-plans', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: GUIDE_PLANS }) }),
  );
  await page.route('**/api/guide/availability-rules', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { rules: [] } }) }),
  );
  await page.route('**/api/guide/blackout-dates', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { blackouts: [] } }) }),
  );
  await page.route('**/api/guide/availability-preview**', (route) => {
    const url = route.request().url();
    const body = url.includes(SCHEDULED_PLAN_ID)
      ? GUIDE_SCHEDULED_PREVIEW
      : { ok: true, data: { slots: [] } };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/guide/availability');
  await page.waitForLoadState('domcontentloaded');

  await page.locator('select[aria-label="篩選方案"]').selectOption(SCHEDULED_PLAN_ID);
  await page.locator('button:has-text("更新預覽")').click();

  await expect(page.getByTestId('preview-scheduled-notice')).toBeVisible();
  await expect(page.getByTestId('preview-scheduled-notice')).toContainText('場次管理');
});

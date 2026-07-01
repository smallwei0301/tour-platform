/**
 * 排程 vs 即時 預約「可用時間來源」嚴格區隔 — PR2 設定面 UX（對稱 #1495）
 *
 * 動態可預約時段規則（guide_availability_rules）只適用即時／申請預約方案；
 * 排程預約方案只看固定場次。admin 與 guide 的時段規則表單選到排程方案時，
 * 必須警示（data-testid="rule-booking-type-warning"）並停用送出；選到即時／
 * 申請方案則正常可送出。方案下拉選項也標 booking_type 中文標籤。
 *
 * 後端守門的合約測試見 tests/api/scheduled-instant-availability-separation.test.mjs；
 * 純函式 label 測試見 tests/unit/booking-type-flow.test.mjs。
 */

import { test, expect, setGuideSession } from './helpers';

const GUIDE_ID = '99999999-9999-9999-9999-0000000000a1';
const ACTIVITY_ID = '11111111-1111-1111-1111-0000000000a1';
const SCHEDULED_PLAN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-0000000000a1';
const INSTANT_PLAN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-0000000000a1';

// ── Admin（/admin/guides/[guideId]/availability，走 /api/v2/admin/...）──

const ADMIN_ACTIVITIES = {
  success: true,
  data: {
    activities: [
      {
        id: ACTIVITY_ID,
        title: '秘島測試行程',
        slug: 'midao-test',
        plans: [
          { id: SCHEDULED_PLAN_ID, name: '排程方案', status: 'active', booking_type: 'scheduled', base_price: 1800, min_participants: 1, max_participants: 8 },
          { id: INSTANT_PLAN_ID, name: '即時方案', status: 'active', booking_type: 'instant', base_price: 1500, min_participants: 1, max_participants: 6 },
        ],
      },
    ],
  },
};

const ADMIN_EMPTY_RULES = { success: true, data: { rules: [] } };
const ADMIN_EMPTY_BLACKOUTS = { success: true, data: { blackouts: [] } };
const ADMIN_EMPTY_PREVIEW = {
  success: true,
  data: { guide: { id: GUIDE_ID, display_name: '測試導遊' }, timezone: 'Asia/Taipei', slots: [] },
};

async function stubAdminPage(page: import('@playwright/test').Page) {
  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/activity-plans`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ACTIVITIES) }),
  );
  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-rules`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_EMPTY_RULES) }),
  );
  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/blackout-dates`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_EMPTY_BLACKOUTS) }),
  );
  await page.route(`**/api/v2/admin/guides/${GUIDE_ID}/availability-preview**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_EMPTY_PREVIEW) }),
  );
}

async function openAdminRuleModal(page: import('@playwright/test').Page) {
  await page.goto(`/admin/guides/${GUIDE_ID}/availability`);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('button:has-text("新增時段")').click();
  await page.waitForSelector('text=新增時段規則', { timeout: 5000 });
  await page.locator('select[aria-label="活動"]').selectOption(ACTIVITY_ID);
}

test('admin：選排程方案 → 警示 + 停用送出', async ({ authedPage: page }) => {
  await stubAdminPage(page);
  await openAdminRuleModal(page);

  await page.locator('select[aria-label="方案"]').selectOption(SCHEDULED_PLAN_ID);
  await expect(page.getByTestId('rule-booking-type-warning')).toBeVisible();
  await expect(page.getByRole('button', { name: /^儲存$|儲存中/ })).toBeDisabled();
});

test('admin：選即時方案 → 無警示、可送出；下拉標 booking_type', async ({ authedPage: page }) => {
  await stubAdminPage(page);
  await openAdminRuleModal(page);

  // 下拉選項標 booking_type 中文標籤（限方案下拉，預覽下拉也含相同標籤故需 scope）。
  const adminPlanSelect = page.locator('select[aria-label="方案"]');
  await expect(adminPlanSelect.locator('option:has-text("排程方案（排程預約")')).toBeAttached();
  await expect(adminPlanSelect.locator('option:has-text("即時方案（即時預約")')).toBeAttached();

  await adminPlanSelect.selectOption(INSTANT_PLAN_ID);
  await expect(page.getByTestId('rule-booking-type-warning')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^儲存$|儲存中/ })).toBeEnabled();
});

// ── Guide（/guide/availability，走 /api/guide/...）──

const GUIDE_PLANS = [
  { activityId: ACTIVITY_ID, activityTitle: '秘島測試行程', activitySlug: 'midao-test', planId: SCHEDULED_PLAN_ID, planName: '排程方案', durationMinutes: 240, bookingType: 'scheduled', minParticipants: 1, maxParticipants: 8, isYearRound: true, activeSeasonSummaries: [] },
  { activityId: ACTIVITY_ID, activityTitle: '秘島測試行程', activitySlug: 'midao-test', planId: INSTANT_PLAN_ID, planName: '即時方案', durationMinutes: 180, bookingType: 'instant', minParticipants: 1, maxParticipants: 6, isYearRound: true, activeSeasonSummaries: [] },
];

async function stubGuidePage(page: import('@playwright/test').Page) {
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
  await page.route('**/api/guide/availability-preview**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { slots: [] } }) }),
  );
}

async function openGuideRuleModal(page: import('@playwright/test').Page) {
  await page.goto('/guide/availability');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('button:has-text("新增時段")').click();
  await page.waitForSelector('text=新增時段規則', { timeout: 5000 });
  await page.locator('select[aria-label="活動"]').selectOption(ACTIVITY_ID);
}

test('guide：選排程方案 → 警示 + 停用送出', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await stubGuidePage(page);
  await openGuideRuleModal(page);

  await page.locator('select[aria-label="方案"]').selectOption(SCHEDULED_PLAN_ID);
  await expect(page.getByTestId('rule-booking-type-warning')).toBeVisible();
  await expect(page.getByRole('button', { name: /^儲存$|儲存中/ })).toBeDisabled();
});

test('guide：選即時方案 → 無警示、可送出；下拉標 booking_type', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await stubGuidePage(page);
  await openGuideRuleModal(page);

  const guidePlanSelect = page.locator('select[aria-label="方案"]');
  await expect(guidePlanSelect.locator('option:has-text("排程方案（排程預約")')).toBeAttached();
  await expect(guidePlanSelect.locator('option:has-text("即時方案（即時預約")')).toBeAttached();

  await guidePlanSelect.selectOption(INSTANT_PLAN_ID);
  await expect(page.getByTestId('rule-booking-type-warning')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^儲存$|儲存中/ })).toBeEnabled();
});

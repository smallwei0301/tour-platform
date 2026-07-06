import { test, expect, setTravelerSession } from './helpers';
import type { Route, Page } from '@playwright/test';

// 延後登入（導遊商店預約精靈）：
//  1. 匿名走完 選方案 → 人數 → 日期 → 時段，聯絡區顯示登入卡；
//     點「登入以完成預約」→ 存 sessionStorage 並導 /login?next=。
//  2. 登入回跳：sessionStorage 狀態還原 → 直接落在 step 2、日期/時段已選，可完成 draft。
//  3. 進入 book 頁會發 shop_begin_booking 事件（深連結預選時 plan_preselected=true）。
// backend 全 page.route mock（同 issue1475-guide-shop-booking-flow 的形狀）。

const SLUG = 'wu-luo-qing';
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const BOOKING_ID = '33333333-3333-4333-8333-333333333333';
const SLOT_DATE = '2026-12-25';
const SLOT_START = '2026-12-25T03:00:00.000Z'; // Asia/Taipei 11:00
const STATE_KEY = `tp_shop_book_state:${SLUG}`;

async function mockShopBackend(page: Page) {
  await page.route('**/api/guides/*/shop**', (route: Route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          guide: { id: 'g1', slug: SLUG, displayName: '吳洛晴', region: '高雄' },
          activitiesByRegion: [
            { region: '高雄', activities: [
              { id: ACTIVITY_ID, slug: 'power', title: '力量', region: '高雄', regionSlug: 'kaohsiung',
                plans: [
                  { id: PLAN_ID, name: '漂漂', basePrice: 610, priceType: 'per_person', duration: '1小時10分鐘', minParticipants: 1, maxParticipants: 4 },
                  // 第二個方案：讓「無預選」路徑仍走 step 1 方案瀏覽（單一方案會自動跳 step 2）
                  { id: 'p2-other', name: '進階', basePrice: 990, priceType: 'per_person', duration: '2小時', minParticipants: 1, maxParticipants: 4 },
                ] },
            ] },
          ],
        },
      }),
    })
  );
  await page.route('**/api/v2/activities/*/available-slots**', (route: Route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          timezone: 'Asia/Taipei',
          dateAvailability: [{ date: SLOT_DATE, state: 'available', capacityLeft: 5 }],
          slots: [{ startAt: SLOT_START, endAt: '2026-12-25T04:10:00.000Z', capacityLeft: 5, isAvailable: true }],
        },
      }),
    })
  );
  await page.route('**/api/me/profile**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { displayName: '王小明', phone: '0912345678' } }) })
  );
  await page.route('**/api/v2/bookings/draft', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { bookingId: BOOKING_ID, orderId: 'o1', amount: 610, currency: 'TWD' } }) })
  );
}

function collectEvents(page: Page): Array<{ event_name: string; properties?: Record<string, unknown> }> {
  const events: Array<{ event_name: string; properties?: Record<string, unknown> }> = [];
  page.route('**/api/events', (route: Route) => {
    try { events.push(JSON.parse(route.request().postData() || '{}')); } catch { /* noop */ }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  return events;
}

test('匿名可走到 step 2，登入 CTA 保存狀態並導向 /login', async ({ page }) => {
  await page.route('**/auth/v1/user**', (route: Route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ msg: 'no session' }) })
  );
  await mockShopBackend(page);
  const events = collectEvents(page);

  await page.goto(`/guides/${SLUG}/shop/book`);
  await page.getByTestId('shop-plan-card').first().click();
  await page.getByRole('button', { name: /選擇日期和時間/ }).click();
  await page.getByTestId('shop-date').first().click();
  await page.getByTestId('shop-slot').first().click();

  // 匿名者：登入卡取代聯絡欄位；CTA 為「登入以完成預約」。
  await expect(page.getByTestId('shop-login-card')).toBeVisible();
  await page.getByTestId('shop-login-cta').click();
  await expect(page).toHaveURL(/\/login\?next=/);

  // 精靈狀態已保存（於 /login 頁讀 sessionStorage — 同分頁存活）。
  const saved = await page.evaluate((key) => sessionStorage.getItem(key), STATE_KEY);
  expect(saved).toBeTruthy();
  const state = JSON.parse(saved as string);
  expect(state.activityId).toBe(ACTIVITY_ID);
  expect(state.planId).toBe(PLAN_ID);
  expect(state.date).toBe(SLOT_DATE);
  expect(state.slotStartAt).toBe(SLOT_START);

  // 進頁時發 shop_begin_booking（無深連結 → plan_preselected=false）。
  const begin = events.find((e) => e.event_name === 'shop_begin_booking');
  expect(begin?.properties?.guide_slug).toBe(SLUG);
  expect(begin?.properties?.plan_preselected).toBe(false);
});

test('登入回跳：sessionStorage 還原 → 直接落在 step 2 並可完成 draft', async ({ page }) => {
  await setTravelerSession(page);
  await mockShopBackend(page);

  // 預埋「登入前保存」的精靈狀態。
  await page.addInitScript(([key, state]) => {
    sessionStorage.setItem(key, state);
  }, [STATE_KEY, JSON.stringify({
    activityId: ACTIVITY_ID, planId: PLAN_ID, guests: 2,
    date: SLOT_DATE, slotStartAt: SLOT_START, savedAt: Date.now(),
  })] as const);

  await page.goto(`/guides/${SLUG}/shop/book`);

  // 直接落在 step 2：月曆可見、時段已選（sib-slot on）、聯絡資訊（已登入）可見。
  await expect(page.getByTestId('shop-calendar')).toBeVisible();
  await expect(page.getByTestId('shop-slot')).toHaveClass(/\bon\b/); // 已選中的時段標記 on
  await expect(page.getByPlaceholder('請填寫姓名')).toHaveValue('王小明');

  // 一次性消費：還原後 sessionStorage 已清。
  expect(await page.evaluate((key) => sessionStorage.getItem(key), STATE_KEY)).toBeNull();

  // 可直接完成預約（draft 成功 → step 3 確認與付款）。CTA 依 mockup 為「確認這個時段」。
  await page.getByRole('button', { name: /確認這個時段/ }).click();
  await expect(page.getByText('確認與付款')).toBeVisible();
});

test('方案卡深連結 ?activityId&planId → 直接落在 step 2（商店首頁已完成選方案）', async ({ page }) => {
  await setTravelerSession(page);
  await mockShopBackend(page);
  const events = collectEvents(page);

  await page.goto(`/guides/${SLUG}/shop/book?activityId=${ACTIVITY_ID}&planId=${PLAN_ID}`);

  // 不再重列方案：直接見月曆＋方案摘要卡（含方案名、人數 stepper）。
  await expect(page.getByTestId('shop-calendar')).toBeVisible();
  await expect(page.getByTestId('shop-plan-summary')).toContainText('漂漂');
  await expect(page.getByTestId('shop-guests-step2')).toHaveText('1');
  await page.getByRole('button', { name: '增加人數' }).click();
  await expect(page.getByTestId('shop-guests-step2')).toHaveText('2');

  const begin = events.find((e) => e.event_name === 'shop_begin_booking');
  expect(begin?.properties?.plan_preselected).toBe(true);

  // 「更換方案」→ 回 step 1 見全部方案卡。
  await page.getByTestId('shop-change-plan').click();
  await expect(page.getByTestId('shop-plan-card')).toHaveCount(2);
});

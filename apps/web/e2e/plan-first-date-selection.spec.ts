import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

/**
 * 活動詳情頁「先選方案 → 方案卡片內顯示該方案可預約日期」流程。
 *
 * 產品決策：進頁面不抓可用性、不顯示上方日期條；點方案後抓一次，
 * 並只顯示該方案（含 planId=null 全方案通用）的日期。
 *
 * 執行方式（本 spec 需要 legacy 方案卡渲染，fixture 無 canonical plans）：
 *   NEXT_PUBLIC_BOOKING_V2_ENABLED=0 PORT=3001 npm run dev   # 另一個終端
 *   PLAYWRIGHT_NO_WEBSERVER=1 NEXT_PUBLIC_BASE_URL=http://localhost:3001 \
 *     npm run test:e2e -w @tour/web -- e2e/plan-first-date-selection.spec.ts
 *
 * 回歸鎖主要在 tests/ui/plan-first-date-selection.test.mjs（CI 會跑）；
 * 本 spec 驗證瀏覽器端互動行為。
 */

test.describe.configure({ timeout: 90_000 });

const SLUG = 'kaohsiung-chaishan-cave-experience';

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

const DATE_A = futureDate(5); // 半日方案可訂
const DATE_B = futureDate(6); // 全日方案可訂

function pillLabel(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

async function mockAvailability(page: Page) {
  await page.route('**/api/activities/**/availability**', (r: Route) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          source: 'v2',
          schedules: [
            { id: 's-a', startAt: `${DATE_A}T09:00:00+08:00`, capacity: 10, bookedCount: 2, status: 'open', planId: 'half-day' },
            { id: 's-b', startAt: `${DATE_B}T09:00:00+08:00`, capacity: 8, bookedCount: 0, status: 'open', planId: 'full-day' },
          ],
        },
      }),
    }),
  );
}

test('進頁面不顯示日期條；點方案後僅顯示該方案日期；切換方案日期重置', async ({ page }) => {
  await mockAvailability(page);
  await page.goto(`/activities/kaohsiung/${SLUG}`);
  await page.waitForLoadState('domcontentloaded');

  const halfDayCard = page.locator('.kkd-plan-card', { hasText: '半日行程' });
  const fullDayCard = page.locator('.kkd-plan-card', { hasText: '全日行程' });
  await expect(halfDayCard).toBeVisible({ timeout: 20_000 });

  // 1. 初始：無上方日期條、無任何日期 pill。
  await expect(page.getByText('出發日期')).toHaveCount(0);
  await expect(page.locator('.tp-date-pill')).toHaveCount(0);

  // 2. 點半日方案 → 卡片內出現「選擇日期」與該方案的日期。
  await halfDayCard.click();
  const halfPicker = page.locator('[data-testid="plan-date-picker-half-day"]');
  await expect(halfPicker).toBeVisible();
  await expect(halfPicker.getByText('選擇日期')).toBeVisible();

  const pillA = halfPicker.locator('.tp-date-pill', { hasText: pillLabel(DATE_A) });
  const pillBInHalf = halfPicker.locator('.tp-date-pill', { hasText: pillLabel(DATE_B) });
  await expect(pillA).toBeEnabled({ timeout: 15_000 });
  await expect(pillBInHalf).toBeDisabled(); // 全日的日期在半日方案下不可選

  // 3. 選日期 → 卡片顯示剩餘名額與日期 tag。
  await pillA.click();
  await expect(halfDayCard.getByText('剩 8 位')).toBeVisible();

  // 4. 切換到全日方案 → 日期重置、只亮全日的日期。
  await fullDayCard.click();
  const fullPicker = page.locator('[data-testid="plan-date-picker-full-day"]');
  await expect(fullPicker).toBeVisible();
  await expect(page.locator('[data-testid="plan-date-picker-half-day"]')).toHaveCount(0);

  const pillB = fullPicker.locator('.tp-date-pill', { hasText: pillLabel(DATE_B) });
  const pillAInFull = fullPicker.locator('.tp-date-pill', { hasText: pillLabel(DATE_A) });
  await expect(pillB).toBeEnabled();
  await expect(pillAInFull).toBeDisabled();
  // 日期已重置：全日卡片不應殘留半日的日期 tag
  await expect(fullDayCard.getByText('剩 8 位')).toHaveCount(0);
});

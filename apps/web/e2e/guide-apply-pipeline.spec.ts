import { test, expect } from '@playwright/test';

/**
 * 導遊申請表單 → API → 持久化 round-trip（不 mock，真打 in-memory 後端）。
 *
 * 鎖定：表單收集的專長/語言/熟悉區域/證照/收款方式必須真的存進
 * guide_applications（先前後端把這些欄位整批丟掉）；第 2 步不再有
 * 送不出去的假檔案上傳欄位，改為誠實流程說明。
 */

test.describe.configure({ timeout: 90_000 });

const EMAIL = `e2e-apply-${Date.now()}@example.com`;

test('填寫申請（含專長/語言/區域/證照）→ 送出 → API 可查回完整資料', async ({ page, request }) => {
  await page.goto('/guide/apply');

  // Step 1：基本資料 + 專長等複選
  await page.locator('#apply-fullname').fill('端對端測試導遊');
  await page.locator('#apply-phone').fill('0911-222-333');
  await page.locator('#apply-email').fill(EMAIL);
  await page.locator('#apply-city').fill('高雄市');
  await page.locator('#apply-bio').fill('十年柴山生態導覽經驗，熟悉在地文史。');
  await page.getByLabel('山林健行').check();
  await page.getByLabel('文化走讀').check();
  await page.getByLabel('英文').check();
  await page.getByLabel('中文').check();
  await page.getByLabel('高雄').check();
  await page.getByLabel('急救證照').check();
  await page.getByRole('button', { name: /下一步：證件與照片/ }).click();

  // Step 2：誠實說明，無假檔案上傳
  await expect(page.getByText('請勿在表單中提供證件影本')).toBeVisible();
  await expect(page.getByText('導遊後台 → 個人檔案')).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByRole('button', { name: /下一步：審核送出/ }).click();

  // Step 3：摘要顯示專長 → 送出
  await expect(page.getByText(/專長：.*山林健行/)).toBeVisible();
  await page.getByRole('button', { name: /送出申請|確認送出/ }).click();

  // Step 4：成功
  await expect(page.getByText(/申請已送出|感謝/)).toBeVisible({ timeout: 15_000 });

  // API round-trip：列表查回該筆，新欄位已持久化
  const res = await request.get('/api/guide-applications');
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const row = (json?.data || []).find((r: { email: string }) => r.email === EMAIL);
  expect(row, '送出的申請必須查得回來').toBeTruthy();
  expect(row.specialties).toEqual(expect.arrayContaining(['山林健行', '文化走讀']));
  expect(row.languages).toEqual(expect.arrayContaining(['中文', '英文']));
  expect(row.regions).toEqual(expect.arrayContaining(['高雄']));
  expect(row.certifications).toEqual(expect.arrayContaining(['急救證照']));
});

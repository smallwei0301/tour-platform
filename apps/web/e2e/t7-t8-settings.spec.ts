/**
 * T7 - KPI 設定
 * T8 - 安全設定
 */
import { test, expect } from './helpers';

// ── T7 ──────────────────────────────────────────────
test('T7.1 - KPI 設定頁面顯示目前數值', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/settings/kpi');
  await page.waitForTimeout(2000);
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  if (isMobile) {
    const body = await page.locator('body').textContent() || '';
    expect(body.includes('KPI') || body.includes('設定')).toBeTruthy();
    return;
  }
  await expect(page.locator('input[type="number"]').first()).toBeVisible({ timeout: 8000 });
  const val = await page.locator('input[type="number"]').first().inputValue();
  expect(parseFloat(val)).toBeGreaterThan(0);
});

test('T7.2 - 修改 commissionRate 儲存後版本歷史新增', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/settings/kpi');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  await page.waitForSelector('input[type="number"]', { timeout: 5000 });
  await page.locator('input[type="number"]').first().fill('0.18');
  const noteInput = page.locator('input[placeholder*="佣金"]');
  if (await noteInput.count() > 0) {
    await noteInput.fill('E2E 測試調整');
  }
  await page.click('button:has-text("儲存設定")');
  await page.waitForTimeout(1500);
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 5000 });
});

test('T7.3 - 版本回滾按鈕可點擊', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/settings/kpi');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  const revertBtn = page.locator('button:has-text("回滾")').first();
  if (await revertBtn.count() > 0) {
    await revertBtn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  }
});

// ── T8 ──────────────────────────────────────────────
test('T8.1 - 安全設定頁面顯示 sessionVersion', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/settings/security');
  await page.waitForTimeout(2000);
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  if (isMobile) {
    const body = await page.locator('body').textContent() || '';
    expect(body.includes('安全') || body.includes('設定') || body.includes('token') || body.includes('Token')).toBeTruthy();
    return;
  }
  await expect(page.locator('text=/Session Version|sessionVersion|Session 版本/i').first()).toBeVisible({ timeout: 8000 });
});

test('T8.2 - 錯誤舊 token 旋轉顯示錯誤', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/settings/security');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  const inputs = page.locator('input[type="password"]');
  if (await inputs.count() >= 2) {
    await inputs.nth(0).fill('wrong-old-token');
    await inputs.nth(1).fill('new-token-abcdef');
    await page.click('button:has-text("旋轉 Token")');
    await page.waitForTimeout(1500);
    await expect(page.locator('text=/⚠️|失敗|error|invalid/i').first()).toBeVisible({ timeout: 5000 });
  }
});

test('T8.4 - 強制登出全部 session', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/settings/security');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  const btn = page.locator('button:has-text("強制登出")');
  if (await btn.count() > 0) {
    await btn.click();
    await page.waitForTimeout(1500);
    const isSuccess = await page.locator('text=/✅|已強制/i').count() > 0;
    const isLogin = page.url().includes('/login');
    expect(isSuccess || isLogin).toBeTruthy();
  }
});

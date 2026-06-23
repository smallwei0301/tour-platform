import { test, expect } from '@playwright/test';

/**
 * #multilingual Phase 0.5 PoC — locale routing browser smoke。
 *
 * 驗證最小搬遷（首頁 + /activities 進 app/[locale]）：
 *  - 預設 zh URL（/、/activities）一字不變、正常渲染、html lang=zh-Hant。
 *  - /en、/en/activities 能渲染（PoC 階段 lang 仍由根 layout 固定 zh-Hant，
 *    lang 正確化留待全面搬遷的多 root layout）。
 *  - admin/guide 登入頁未被 locale 前綴干擾（仍正常）。
 *
 * 公開頁，無需 auth；DB 走 in-memory fallback（dev 無 Supabase env）。
 */

test('預設中文首頁 / 正常渲染、html lang=zh-Hant', async ({ page }) => {
  const resp = await page.goto('/');
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  // 站台 logo 一定在導覽列
  await expect(page.getByText('MIDAO').first()).toBeVisible();
});

test('英文首頁 /en 能渲染（不 404、不無限轉導）', async ({ page }) => {
  const resp = await page.goto('/en');
  expect(resp?.status()).toBeLessThan(400);
  expect(page.url()).toContain('/en');
  await expect(page.getByText('MIDAO').first()).toBeVisible();
});

test('預設中文 /activities 正常渲染', async ({ page }) => {
  const resp = await page.goto('/activities');
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
});

test('英文 /en/activities 能渲染', async ({ page }) => {
  const resp = await page.goto('/en/activities');
  expect(resp?.status()).toBeLessThan(400);
  expect(page.url()).toContain('/en/activities');
});

test('admin 登入頁未被 locale 前綴干擾', async ({ page }) => {
  const resp = await page.goto('/admin/login');
  expect(resp?.status()).toBeLessThan(400);
  expect(page.url()).toContain('/admin/login');
});

test('guide 登入頁未被 locale 前綴干擾', async ({ page }) => {
  const resp = await page.goto('/guide/login');
  expect(resp?.status()).toBeLessThan(400);
  expect(page.url()).toContain('/guide/login');
});

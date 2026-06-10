import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Admin 後台「讀取失敗」可視性 — 系統性修復。
 *
 * 事故：admin dashboard 所有 KPI 卡片顯示 0、訂單看似全部消失。調查
 * 結果：訂單資料完好，但 dashboard 與訂單列表頁在 API 失敗時靜默把
 * 畫面渲染成 0／空表，「讀取失敗」與「真的沒資料」完全無法分辨；且
 * 「近 7 日」範圍語意（只統計近 7 日建立的訂單）也會讓舊訂單看似消失。
 *
 * 鎖定行為：
 *   1. summary API 失敗 → dashboard 顯示中文錯誤橫幅＋重試按鈕，不顯示 0 卡片。
 *   2. summary API 成功但範圍內 0 訂單 → 顯示範圍提示（引導切換範圍／查看全部訂單）。
 *   3. orders API 失敗 → 訂單列表頁顯示中文錯誤橫幅＋重試，不顯示空表。
 *   4. 重試按鈕會重新發出請求，成功後恢復正常渲染。
 */

test.describe.configure({ timeout: 90_000 });

const SUMMARY_OK_ZERO = {
  ok: true,
  data: {
    kpi: {
      totalOrders: 0, pendingOrders: 0, pendingRefunds: 0, pendingGuideApps: 0,
      totalGmv: 0, totalCommissionTwd: 0, healthyOrderRate: 0, exceptionRate: 0, refundRate: 0,
    },
    trends: [],
    pendingItems: { orders: [], refunds: [], guides: [] },
  },
};

const SUMMARY_OK_NONZERO = {
  ok: true,
  data: {
    kpi: {
      totalOrders: 5, pendingOrders: 2, pendingRefunds: 0, pendingGuideApps: 0,
      totalGmv: 16500, totalCommissionTwd: 2475, healthyOrderRate: 80, exceptionRate: 0, refundRate: 0,
    },
    trends: [],
    pendingItems: { orders: [], refunds: [], guides: [] },
  },
};

test('dashboard：summary API 失敗 → 錯誤橫幅＋重試，重試成功後恢復', async ({ authedPage: page }) => {
  let failNext = true;
  await page.route('**/api/admin/dashboard/summary**', (r: Route) => {
    if (failNext) {
      return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: 'boom' } }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUMMARY_OK_NONZERO) });
  });

  await page.goto('/admin');
  const banner = page.getByTestId('admin-dashboard-load-error');
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner).toContainText('儀表板資料載入失敗');
  // 失敗時不得渲染成 0 卡片（避免被誤讀為「沒有訂單」）。
  await expect(page.getByText('總訂單')).toHaveCount(0);

  // 重試 → 成功 → 正常渲染。
  failNext = false;
  await page.getByRole('button', { name: '重試' }).click();
  await expect(page.getByText('總訂單')).toBeVisible({ timeout: 15_000 });
  await expect(banner).toHaveCount(0);
});

test('dashboard：範圍內 0 訂單 → 顯示範圍語意提示（非錯誤）', async ({ authedPage: page }) => {
  await page.route('**/api/admin/dashboard/summary**', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUMMARY_OK_ZERO) }),
  );

  await page.goto('/admin');
  await expect(page.getByText('總訂單')).toBeVisible({ timeout: 20_000 });
  const hint = page.getByTestId('admin-dashboard-zero-range-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('此時間範圍內沒有訂單');
  // 提示提供導向：切換範圍或查看全部訂單。
  await expect(hint.getByRole('link', { name: '訂單管理' })).toBeVisible();
});

test('訂單列表：orders API 失敗 → 錯誤橫幅＋重試，不顯示空表', async ({ authedPage: page }) => {
  let failNext = true;
  await page.route('**/api/admin/orders', (r: Route) => {
    if (failNext) {
      return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: 'boom' } }) });
    }
    return r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [{ id: 'ORD-1', status: 'paid', totalTwd: 3000, costTwd: 2550, marginTwd: 450, title: '測試活動', peopleCount: 2, contactName: '王小明', contactEmail: 'a@b.c', createdAt: new Date().toISOString() }] }),
    });
  });

  await page.goto('/admin/orders');
  const banner = page.getByTestId('admin-orders-load-error');
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner).toContainText('訂單資料載入失敗');

  failNext = false;
  await page.getByRole('button', { name: '重試' }).click();
  await expect(page.getByText('測試活動').first()).toBeVisible({ timeout: 15_000 });
  await expect(banner).toHaveCount(0);
});

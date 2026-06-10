/**
 * Admin dashboard 趨勢圖必須跟隨選擇的時間範圍。
 *
 * Bug：adminDashboardSummaryDb 的 trend builder 寫死 `for (let i = 6; …)`
 * 永遠只產生近 7 天的桶 — 選「近 30 日」「今天」或自訂範圍時，KPI 卡片
 * 正確換範圍，趨勢圖卻仍停留在近 7 日，呈現互相矛盾。
 *
 * 契約：
 *   - preset today → 1 桶（今天）
 *   - preset 7d    → 7 桶（今天往回 6 天）
 *   - preset 30d   → 30 桶
 *   - 自訂 from/to → 依日計桶（含頭尾）
 *   - 防爆量：桶數上限 90，超過時保留最近 90 天
 *   - 無 preset / 無 from/to → 維持預設近 7 日（向後相容）
 *
 * 透過 in-memory fallback（hasSupabaseEnv()=false）直接呼叫 gateway。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminDashboardSummaryDb } from '../../src/lib/db.mjs';

function ymdDaysAgo(daysAgo) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

test('trend: preset=7d → 7 個連續日桶，最後一桶為今天', async () => {
  const { trends } = await adminDashboardSummaryDb({ preset: '7d' });
  assert.equal(trends.length, 7);
  assert.equal(trends[trends.length - 1].date, ymdDaysAgo(0));
  assert.equal(trends[0].date, ymdDaysAgo(6));
});

test('trend: preset=30d → 30 個日桶（不再寫死 7 天）', async () => {
  const { trends } = await adminDashboardSummaryDb({ preset: '30d' });
  assert.equal(trends.length, 30, '近 30 日趨勢圖必須是 30 桶');
  assert.equal(trends[trends.length - 1].date, ymdDaysAgo(0));
  assert.equal(trends[0].date, ymdDaysAgo(29));
});

test('trend: preset=today → 1 桶', async () => {
  const { trends } = await adminDashboardSummaryDb({ preset: 'today' });
  assert.equal(trends.length, 1);
  assert.equal(trends[0].date, ymdDaysAgo(0));
});

test('trend: 自訂 from/to → 依日計桶（含頭尾）', async () => {
  const from = `${ymdDaysAgo(9)}T00:00:00.000Z`;
  const to = `${ymdDaysAgo(5)}T23:59:59.999Z`;
  const { trends } = await adminDashboardSummaryDb({ from, to });
  assert.equal(trends.length, 5, '5 天的自訂範圍應有 5 桶');
  assert.equal(trends[0].date, ymdDaysAgo(9));
  assert.equal(trends[trends.length - 1].date, ymdDaysAgo(5));
});

test('trend: 超長自訂範圍以 90 桶為上限（保留最近 90 天）', async () => {
  const from = `${ymdDaysAgo(365)}T00:00:00.000Z`;
  const to = `${ymdDaysAgo(0)}T23:59:59.999Z`;
  const { trends } = await adminDashboardSummaryDb({ from, to });
  assert.equal(trends.length, 90);
  assert.equal(trends[trends.length - 1].date, ymdDaysAgo(0), '截尾保留最近的日子');
});

test('trend: 無 preset / 無 from-to → 預設近 7 日（向後相容）', async () => {
  const { trends } = await adminDashboardSummaryDb({});
  assert.equal(trends.length, 7);
});

test('trend: 範圍內訂單會被計入對應日桶（in-memory 種子）', async () => {
  // in-memory 種子訂單建立於現在～48 小時前，近 7 日總數應 > 0
  const { trends, kpi } = await adminDashboardSummaryDb({ preset: '7d' });
  const totalInTrend = trends.reduce((acc, t) => acc + Number(t.orders || 0), 0);
  assert.ok(totalInTrend > 0, 'trend 桶必須累計到種子訂單');
  assert.ok(kpi.totalOrders > 0);
});

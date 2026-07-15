// #1637 每月會計報帳報表 — route/DB/UI 接線 source-contract 測試
// （import.meta.url 錨定路徑，避免 cwd 依賴——lessons #1613）
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(webRoot, rel), 'utf8');

describe('JSON route（/api/v2/admin/reports/monthly）', () => {
  const src = read('app/api/v2/admin/reports/monthly/route.ts');

  it('驗證 month 參數並以 jsonError 回 400（#1614 標準骨架）', () => {
    assert.match(src, /isValidReportMonth\(month\)/);
    assert.match(src, /jsonError\('INVALID_PARAM', 'month must be YYYY-MM', 400\)/);
  });

  it('走 service 層組報表並以 jsonOk 回傳', () => {
    assert.match(src, /getMonthlyAccountingReport\(month\)/);
    assert.match(src, /jsonOk\(report\)/);
  });

  it('catch 接事故上報（#1598 handleRouteError）', () => {
    assert.match(src, /handleRouteError\(err, \{\s*route: 'v2\/admin\/reports\/monthly'/);
  });

  it('force-dynamic（報表不可被快取）', () => {
    assert.match(src, /export const dynamic = 'force-dynamic'/);
  });
});

describe('CSV route（/api/v2/admin/reports/monthly/csv）', () => {
  const src = read('app/api/v2/admin/reports/monthly/csv/route.ts');

  it('renderMonthlyAccountingCsv + text/csv + attachment 檔名含月份', () => {
    assert.match(src, /renderMonthlyAccountingCsv\(report\)/);
    assert.match(src, /text\/csv; charset=utf-8/);
    assert.match(src, /attachment; filename="midao-monthly-report-\$\{month\}\.csv"/);
    assert.match(src, /'cache-control':\s*'no-store'/);
  });

  it('同樣驗證 month 參數且 catch 接事故上報', () => {
    assert.match(src, /isValidReportMonth\(month\)/);
    assert.match(src, /handleRouteError\(err, \{\s*route: 'v2\/admin\/reports\/monthly\/csv'/);
  });
});

describe('service 層（src/lib/accounting/report-service.mjs）', () => {
  const src = read('src/lib/accounting/report-service.mjs');

  it('無 Supabase env 時回空報表（env-fallback）', () => {
    assert.match(src, /if \(!getSupabaseUrl\(\)\)/);
  });

  it('用 service-role client（payouts/payments 為 service-role-only 表）', () => {
    assert.match(src, /getSupabaseServiceRoleKey/);
  });
});

describe('DB 層（src/lib/accounting/db-report.mjs）— strangler 領域子資料夾', () => {
  const src = read('src/lib/accounting/db-report.mjs');

  it('收款依 orders.paid_at 歸月', () => {
    assert.match(src, /\.gte\('paid_at', startIso\)/);
    assert.match(src, /\.lt\('paid_at', endIso\)/);
  });

  it('退款依 payments.refunded_at 歸月且金額 > 0', () => {
    assert.match(src, /from\('payments'\)/);
    assert.match(src, /\.gte\('refunded_at', startIso\)/);
    assert.match(src, /\.gt\('refunded_amount_twd', 0\)/);
  });

  it('結算依 payout_items.settled_at 歸月（含 settlement_kind 欄）', () => {
    assert.match(src, /from\('payout_items'\)/);
    assert.match(src, /\.gte\('settled_at', startIso\)/);
    assert.match(src, /settlement_kind/);
  });

  it('出帳依 payouts.confirmed_at 歸月且 state=paid', () => {
    assert.match(src, /\.eq\('state', 'paid'\)/);
    assert.match(src, /\.gte\('confirmed_at', startIso\)/);
  });

  it('對帳異常：paid 未結算以全期結算分錄判斷', () => {
    assert.match(src, /\.eq\('status', 'paid'\)/);
    assert.match(src, /settledEverIds/);
    assert.match(src, /\.is\('paid_at', null\)/);
  });

  it('不 import db.mjs（strangler 硬規則）', () => {
    assert.doesNotMatch(src, /from ['"].*\/db\.mjs['"]/);
  });
});

describe('Admin UI 接線', () => {
  it('AdminShell 有 /admin/reports 導航項', () => {
    const src = read('src/components/admin/AdminShell.tsx');
    assert.match(src, /\/admin\/reports/);
    assert.match(src, /月結報表/);
  });

  it('報表頁有月份選擇、產出按鈕與 CSV 下載連結', () => {
    const src = read('app/(non-locale)/admin/reports/page.tsx');
    assert.match(src, /type="month"/);
    assert.match(src, /\/api\/v2\/admin\/reports\/monthly\?month=/);
    assert.match(src, /\/api\/v2\/admin\/reports\/monthly\/csv\?month=/);
    assert.match(src, /monthly-report-generate/);
    assert.match(src, /對帳異常/);
  });
});

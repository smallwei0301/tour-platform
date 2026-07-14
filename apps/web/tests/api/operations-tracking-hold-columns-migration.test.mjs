/**
 * 防迴歸：operations_tracking 的 payout-hold 欄位 code↔schema 對齊。
 *
 * 背景（live 實測抓到）：#1221/#1284 讓 settlement-config `isPayoutOnHold` 與導遊
 * 儀表板 / 撥款明細(JSON/CSV) 讀 operations_tracking.is_disputed / is_safety_case，
 * 但從沒有 migration 建立這兩個欄位。真實 DB 上這些 guide-facing 的 select 整個
 * 報錯（PostgREST: column does not exist），route 把錯誤吞掉（data ?? []），導致
 * refund_amount_twd（#847 effective gmv）與 hold 在導遊端被靜默丟棄 —— 導遊看到的是
 * 退款前的全額而非實收金額。典型 code/schema 漂移（類 #1376）。
 *
 * 本測試鎖定：凡 guide-facing route 從 operations_tracking select 的 hold 欄位，
 * 都必須有 migration 建立 —— 避免日後再加欄位卻漏 migration。
 *
 * Run: node --test apps/web/tests/api/operations-tracking-hold-columns-migration.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const migrationsDir = join(repoRoot, '..', '..', 'supabase', 'migrations');

function allMigrationsSql() {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.rollback.sql'))
    .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
    .join('\n');
}

const HOLD_COLUMNS = ['is_disputed', 'is_safety_case'];

test('migration 建立 operations_tracking 的 is_disputed / is_safety_case 欄位', () => {
  const sql = allMigrationsSql();
  for (const col of HOLD_COLUMNS) {
    assert.match(
      sql,
      new RegExp(`add column[^;]*\\b${col}\\b`, 'i'),
      `必須有 migration ADD COLUMN ${col} 到 operations_tracking（否則 guide-facing select 會報錯）`,
    );
  }
});

test('guide dashboard / payout 路由 select 的 hold 欄位都有 migration 涵蓋', () => {
  const sql = allMigrationsSql();
  const routes = [
    'app/api/guide/dashboard/route.ts',
    'app/api/v2/guide/payout/monthly/route.ts',
    'app/api/v2/guide/payout/monthly/csv/route.ts',
  ];
  // operations_tracking 既有欄位（001_mvp_core_v2.sql 建立）+ 本次新增
  const migratedColumns = new Set([
    'refund_amount_twd', 'has_complaint', 'has_oversell_issue',
    'is_rescheduled', 'has_guide_adjustment', 'manual_minutes',
    'manual_cost_twd', 'subsidy_twd', 'order_id', 'note', 'is_disputed', 'is_safety_case',
  ]);
  for (const rel of routes) {
    const src = readFileSync(join(repoRoot, rel), 'utf8');
    // 找 .from('operations_tracking').select('...') 內列的欄位
    const m = src.match(/from\(['"]operations_tracking['"]\)[\s\S]*?\.select\(\s*['"]([^'"]+)['"]/);
    if (!m) continue; // 該 route 可能用 join 形式（sweep），略過
    const cols = m[1].split(',').map((c) => c.trim()).filter(Boolean);
    for (const col of cols) {
      assert.ok(
        migratedColumns.has(col),
        `${rel} select 了 operations_tracking.${col}，但沒有對應 migration（會在 live 報錯）`,
      );
      // 對 hold 欄位額外確認 migration SQL 真的建立
      if (HOLD_COLUMNS.includes(col)) {
        assert.match(sql, new RegExp(`\\b${col}\\b`, 'i'), `migration 應建立 ${col}`);
      }
    }
  }
});

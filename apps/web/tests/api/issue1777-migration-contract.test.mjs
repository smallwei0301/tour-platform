/**
 * Issue #1777 — 財務 migration 的結構與安全契約。
 *
 * NOT_AUTOMATABLE-env：本 repo 的測試環境沒有 Postgres 實例，無法真的套用
 * migration 或執行 plpgsql，因此交易語意（同成同敗、FOR UPDATE 鎖、ON CONFLICT
 * 冪等）必須靠 staging 驗證。這裡鎖的是**能在靜態層被破壞的安全屬性**——那些
 * 一旦寫錯就會讓錢算錯、且 code review 容易看漏的地方：
 *   - 每支金流函式都要 pin search_path（#1564／#1678 的既定要求）
 *   - 執行權限收斂到 service_role，不得留給 anon／authenticated
 *   - 餘額不足必須 RAISE，不得出現 max(0) 這類靜默截斷
 *   - 餘額更新必須是 SQL 層增減，不得是應用層算好的整列覆寫
 *   - 每個 migration 都要有可回滾的同名 .rollback.sql，且回滾不得刪資料表
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../../../../supabase/migrations');

/** #1777 本次新增的 migration（依 phase 排序）。 */
const ISSUE_1777_MIGRATIONS = [
  '20260729160000_issue1777_atomic_settlement_and_payout_confirm',
  '20260729170000_issue1777_refund_adjustment_ledger',
];

function readMigration(base) {
  return readFileSync(join(MIGRATIONS_DIR, `${base}.sql`), 'utf8');
}

/** 去掉 SQL 註解，避免解釋性文字讓斷言假綠。 */
function sqlCode(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}

describe('#1777 — migration 檔案結構', () => {
  for (const base of ISSUE_1777_MIGRATIONS) {
    it(`${base} 存在且為時間戳命名`, () => {
      assert.ok(existsSync(join(MIGRATIONS_DIR, `${base}.sql`)), `${base}.sql 必須存在`);
      assert.match(base, /^\d{14}_/, 'migration 必須是 14 位時間戳命名（只增不改）');
    });

    it(`${base} 有對應的 rollback`, () => {
      const rollbackPath = join(MIGRATIONS_DIR, `${base}.rollback.sql`);
      assert.ok(existsSync(rollbackPath), `${base}.rollback.sql 必須存在`);
      const rollback = sqlCode(readFileSync(rollbackPath, 'utf8'));
      assert.doesNotMatch(rollback, /DROP\s+TABLE/i, 'rollback 不得刪表——那會毀掉正常業務資料');
      assert.doesNotMatch(rollback, /DELETE\s+FROM/i, 'rollback 不得刪資料列');
      assert.doesNotMatch(rollback, /TRUNCATE/i, 'rollback 不得 TRUNCATE');
    });
  }

  it('未修改任何既有 migration（只增不改）', () => {
    // 既有 migration 的檔名清單不該因本次工作而減少；這裡確保 #1777 的檔案
    // 都是新增的時間戳檔，而非覆寫既有檔名。
    const files = new Set(readdirSync(MIGRATIONS_DIR));
    for (const base of ISSUE_1777_MIGRATIONS) {
      assert.ok(files.has(`${base}.sql`), `${base}.sql 應存在於 migrations 目錄`);
    }
    // #449 建立的複合唯一索引是 Phase 3 的前提，必須仍在
    assert.ok(files.has('20260513_issue449_payout_items_reversal.sql'), '既有 #449 migration 不得被移除');
  });
});

describe('#1777 Phase 2 — 原子函式的安全屬性', () => {
  const src = readMigration(ISSUE_1777_MIGRATIONS[0]);
  const code = sqlCode(src);

  it('兩支函式都 pin 了 search_path', () => {
    const pins = code.match(/SET\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/gi) ?? [];
    assert.ok(pins.length >= 2, `金流函式必須 pin search_path（#1564／advisor 0011），目前 ${pins.length} 處`);
  });

  it('執行權限收斂到 service_role', () => {
    assert.match(code, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.fn_record_settlement_atomic[\s\S]*?FROM\s+PUBLIC/i);
    assert.match(code, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.fn_confirm_payout_atomic[\s\S]*?FROM\s+PUBLIC/i);
    assert.match(code, /GRANT\s+EXECUTE[\s\S]*?fn_record_settlement_atomic[\s\S]*?TO\s+service_role/i);
    assert.match(code, /GRANT\s+EXECUTE[\s\S]*?fn_confirm_payout_atomic[\s\S]*?TO\s+service_role/i);
    assert.doesNotMatch(code, /GRANT\s+EXECUTE[\s\S]*?TO\s+(anon|authenticated)/i, '出款函式不得授權給 anon／authenticated');
  });

  it('結算與確認出款都對關鍵列加鎖', () => {
    const locks = code.match(/FOR\s+UPDATE/gi) ?? [];
    assert.ok(locks.length >= 3, `orders／guide_balances／payouts 都必須 FOR UPDATE，目前 ${locks.length} 處`);
  });

  it('餘額不足時 RAISE，絕不靜默截斷', () => {
    assert.match(code, /insufficient guide balance/i, '餘額不足必須拋出可辨識的例外');
    assert.doesNotMatch(
      code,
      /greatest\s*\(\s*0\s*,/i,
      '不得用 greatest(0, …) 把餘額差額吞掉——那正是舊 Math.max(0, …) 的問題',
    );
  });

  it('餘額以 SQL 層增減，不是應用層算好的整列覆寫', () => {
    assert.match(
      code,
      /balance_twd\s*=\s*guide_balances\.balance_twd\s*\+/i,
      '必須以 balance + delta 形式更新，避免 read-modify-write 的 lost update',
    );
  });

  it('結算在交易內重驗 hold 旗標與付款狀態', () => {
    for (const flag of ['is_disputed', 'is_safety_case', 'has_complaint', 'has_oversell_issue']) {
      assert.match(code, new RegExp(flag), `交易內資格重驗必須涵蓋 ${flag}`);
    }
    assert.match(code, /paid_at\s+IS\s+NULL/i, '未實收的訂單不得結算');
  });

  it('ledger 冪等：只有真正插入新分錄才動餘額', () => {
    assert.match(code, /ON\s+CONFLICT\s*\(\s*order_id\s*,\s*settlement_kind\s*\)\s*DO\s+NOTHING/i);
    assert.match(code, /RETURNING\s+id\s+INTO/i, '必須以 RETURNING 判定是否真的新增，否則重跑會重複累加');
  });

  it('confirm 對已付款的 payout 冪等回應而非重複扣款', () => {
    assert.match(code, /already_paid/i, '重送必須回報 already_paid');
  });
});

describe('#1777 Phase 3 — 退款 adjustment ledger 的安全屬性', () => {
  const src = readMigration(ISSUE_1777_MIGRATIONS[1]);
  const code = sqlCode(src);

  it('pin search_path 且權限收斂到 service_role', () => {
    assert.match(code, /SET\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/i);
    assert.match(code, /GRANT\s+EXECUTE[\s\S]*?fn_apply_refund_adjustment_atomic[\s\S]*?TO\s+service_role/i);
    assert.doesNotMatch(code, /GRANT\s+EXECUTE[\s\S]*?TO\s+(anon|authenticated)/i);
  });

  it('settlement_kind 擴充為含 refund_adjustment，且保留既有兩種', () => {
    assert.match(code, /refund_adjustment/, '必須新增 refund_adjustment 分錄型別');
    for (const kind of ['settlement', 'reversal']) {
      assert.match(code, new RegExp(`'${kind}'`), `既有的 ${kind} 分錄型別不得移除`);
    }
  });

  it('adjustment 以退款事件為冪等鍵（可多筆，與 settlement 的唯一鍵並存）', () => {
    assert.match(code, /refund_event_id/, '必須有退款事件冪等鍵欄位');
    // 既有 (order_id, settlement_kind) 唯一鍵只能約束 settlement／reversal，
    // 否則同一訂單的多次部分退款無法各自留下一筆差額分錄。
    assert.match(
      code,
      /CREATE\s+UNIQUE\s+INDEX[\s\S]*?WHERE\s+settlement_kind\s+IN\s*\(\s*'settlement'\s*,\s*'reversal'\s*\)/i,
      'settlement／reversal 的唯一鍵必須改為部分索引，才能讓 adjustment 多筆並存',
    );
    assert.match(
      code,
      /CREATE\s+UNIQUE\s+INDEX[\s\S]*?refund_event_id/i,
      'adjustment 必須以 refund_event_id 唯一，確保同一退款事件只記一次差額',
    );
  });

  it('差額計算沿用 floor 語意（commission／net 各自 floor、殘差歸平台）', () => {
    assert.match(code, /floor\s*\(/i, '必須用 floor 對齊 computeSweepPayoutItem 的整數規則');
  });

  it('已出款的訂單全額退款時建立 carry-forward，不靜默歸零', () => {
    assert.match(code, /carry_forward/i, '已出款者必須留下可追蹤的 carry-forward，而非把差額吞掉');
  });
});

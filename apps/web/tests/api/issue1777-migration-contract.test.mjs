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
  '20260729180000_issue1777_revoke_atomic_fns_from_anon',
  // 獨立審查後的修復：ON CONFLICT predicate（P0）＋ default privileges FOR ROLE
  '20260729190000_issue1777_post_review_fixes',
];

/** 本 issue 建立的財務函式——權限收斂必須涵蓋每一支。 */
const FINANCIAL_FUNCTIONS = [
  'fn_record_settlement_atomic',
  'fn_confirm_payout_atomic',
  'fn_apply_refund_adjustment_atomic',
];

function readMigration(base) {
  return readFileSync(join(MIGRATIONS_DIR, `${base}.sql`), 'utf8');
}

/**
 * 去掉 SQL 註解，避免解釋性文字讓斷言假綠。
 *
 * originally 只剝行首 `--`（`/^\s*--.*$/gm`），因此 `SELECT 1; -- REVOKE ALL …`
 * 這種**行中**註解仍會被斷言匹配到——守門是壞的（獨立審查 2026-07-29 實測）。
 * 現改剝任意位置的 `--` 到行尾。
 *
 * 已知限制：不解析字串字面值，故 `'a--b'` 內的 `--` 也會被剝掉。本檔的斷言
 * 都不依賴字串內容，這個取捨可接受；若日後需要精確處理，得改用真正的 SQL 詞法切分。
 */
function sqlCode(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
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

// ── 權限收斂：跨 migration 的整體屬性 ─────────────────────────────────────────
//
// 教訓（2026-07-29 套用後實查）：Phase 2／3 只寫了 `REVOKE ALL … FROM PUBLIC`，
// 但 Supabase 在 public schema 對 anon／authenticated 有 FUNCTIONS 的 default
// privileges，新建函式仍自動取得 EXECUTE——REVOKE FROM PUBLIC 撤不掉具名角色的
// 權限。原本的斷言只檢查「沒有明確 GRANT 給 anon」，因此測試全綠而 production
// 上未登入者可直接呼叫 fn_confirm_payout_atomic 扣餘額。
//
// 所以這裡改鎖**正面條件**：每支財務函式都必須被明確 REVOKE FROM anon／
// authenticated。「沒有寫 GRANT」不等於「沒有權限」。

describe('#1777 — 財務函式的 EXECUTE 權限必須自 anon／authenticated 收回', () => {
  const allCode = ISSUE_1777_MIGRATIONS.map((base) => sqlCode(readMigration(base))).join('\n');

  for (const fn of FINANCIAL_FUNCTIONS) {
    it(`${fn} 被明確 REVOKE FROM anon／authenticated`, () => {
      const revokePattern = new RegExp(
        `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*FROM\\s+[^;]*anon[^;]*authenticated`,
        'i',
      );
      assert.match(
        allCode,
        revokePattern,
        `${fn} 必須被明確自 anon／authenticated 撤銷 EXECUTE；`
          + '只寫 REVOKE … FROM PUBLIC 擋不住 Supabase 的 default privileges',
      );
    });

    it(`${fn} 明確授權給 service_role`, () => {
      assert.match(
        allCode,
        new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*TO\\s+service_role`, 'i'),
        `${fn} 必須授權給 service_role（撤銷後若沒補授權，正常路徑會壞）`,
      );
    });
  }

  it('沒有任何財務函式被授權給 anon／authenticated', () => {
    assert.doesNotMatch(
      allCode,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION[^;]*TO\s+[^;]*\b(anon|authenticated)\b/i,
      '財務函式不得授權給未登入或一般登入角色',
    );
  });

  it('對 FUNCTIONS 的 default privileges 已收斂，日後新函式不再自動放行', () => {
    for (const role of ['anon', 'authenticated']) {
      assert.match(
        allCode,
        new RegExp(`ALTER\\s+DEFAULT\\s+PRIVILEGES[\\s\\S]*?REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTIONS\\s+FROM\\s+${role}`, 'i'),
        `必須撤銷 ${role} 對 FUNCTIONS 的 default privileges，否則下一支金流函式會重蹈覆轍`,
      );
    }
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
    assert.match(code, /ON\s+CONFLICT\s*\(\s*order_id\s*,\s*settlement_kind\s*\)/i);
    assert.match(code, /RETURNING\s+id\s+INTO/i, '必須以 RETURNING 判定是否真的新增，否則重跑會重複累加');
  });

  it('confirm 對已付款的 payout 冪等回應而非重複扣款', () => {
    assert.match(code, /already_paid/i, '重送必須回報 already_paid');
  });
});

// ── P0 迴歸：ON CONFLICT 必須能推論到部分唯一索引 ─────────────────────────────
//
// 2026-07-29 獨立審查發現（production 已 live）：Phase 3 把
// payout_items_order_kind_unique 改成帶 WHERE 的部分索引後，Phase 2 的
//     ON CONFLICT (order_id, settlement_kind) DO NOTHING
// 就再也推論不到該索引，Postgres 直接 42P10——settlement sweep 會整批失敗。
// production EXPLAIN 實測確認：不帶 predicate → 42P10；帶 predicate →
// 「Conflict Arbiter Indexes: payout_items_order_kind_unique」。
//
// 更糟的是原本的契約測試斷言了 `… DO NOTHING` 這個**壞形式**，等於把 bug 鎖住。
// 這裡改鎖真正的不變量：只要 payout_items 的唯一索引是部分索引，所有針對它的
// ON CONFLICT 就必須帶上一致的 predicate。

describe('#1777 P0 迴歸 — ON CONFLICT 必須與部分索引的 predicate 一致', () => {
  const allCode = ISSUE_1777_MIGRATIONS.map((base) => sqlCode(readMigration(base))).join('\n');

  it('payout_items_order_kind_unique 確實是部分索引', () => {
    assert.match(
      allCode,
      /CREATE\s+UNIQUE\s+INDEX[^;]*payout_items_order_kind_unique[\s\S]*?WHERE\s+settlement_kind\s+IN\s*\(\s*'settlement'\s*,\s*'reversal'\s*\)/i,
      '這是本測試的前提；若索引改回全表唯一，本檔的 predicate 要求也要一併改',
    );
  });

  it('最終生效的 fn_record_settlement_atomic 定義帶 predicate', () => {
    // migration 只增不改，舊檔裡不帶 predicate 的版本會永遠留著——所以不能掃
    // 全部檔案，要看「最後一支重新定義該函式的 migration」，那才是 DB 上生效的版本。
    const defining = ISSUE_1777_MIGRATIONS
      .filter((base) => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_record_settlement_atomic/i
        .test(sqlCode(readMigration(base))))
      .sort();

    assert.ok(defining.length > 0, '應有 migration 定義 fn_record_settlement_atomic');

    const latest = defining[defining.length - 1];
    const code = sqlCode(readMigration(latest));
    const match = code.match(/ON\s+CONFLICT\s*\(\s*order_id\s*,\s*settlement_kind\s*\)([\s\S]{0,120})/i);

    assert.ok(match, `${latest} 應有 ON CONFLICT (order_id, settlement_kind)`);
    assert.match(
      match[1],
      /^\s*WHERE\s+settlement_kind\s+IN\s*\(/i,
      `${latest} 的 ON CONFLICT 未帶 predicate——推論不到部分索引，會 42P10 讓 sweep 整批失敗`,
    );
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

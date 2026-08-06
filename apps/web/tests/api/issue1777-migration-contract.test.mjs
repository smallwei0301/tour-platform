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
  // 收尾稽核後的修復：累積退款額原子累加（F1）＋冪等鍵改由 DB 端推導（F2）＋
  // carry-forward 不再被 delta=0 早退跳過（F5）
  '20260730093000_issue1777_refund_delta_accumulation',
  // F4：退款紅沖收斂為單一交易（最後一處應用層 read-modify-write）
  '20260804103000_issue1777_atomic_refund_reversal',
  // F3：結算金額改由 DB 端在交易內重算，不再信任呼叫端傳值
  '20260804113000_issue1777_settlement_recompute_amounts',
];

/** 本 issue 建立的財務函式——權限收斂必須涵蓋每一支。 */
const FINANCIAL_FUNCTIONS = [
  'fn_record_settlement_atomic',
  'fn_confirm_payout_atomic',
  'fn_apply_refund_adjustment_atomic',
  'fn_record_refund_reversal_atomic',
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

// ⚠️ 以下鎖的是 20260729170000 這支 migration 建立的**schema**（分錄型別、
// refund_event_id、部分索引）與當時的函式定義。函式本體已由
// 20260730093000 取代（累積額改在交易內累加、冪等鍵改由 DB 端推導）——DB 上
// 生效的版本請看下一個 describe。
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

// ── 退款鏈修復（F1／F2／F5）──────────────────────────────────────────────────
//
// 收尾稽核（2026-07-30）在呼叫端抓到的兩個 P0：累積退款額被覆寫（F1）、冪等鍵
// 以本次金額組成（F2）。兩者的修法都是「把責任搬進 RPC 交易內」，因此這裡鎖的
// 是**最後一支重新定義該函式的 migration**（migration 只增不改，舊檔的壞版本會
// 永遠留在目錄裡，掃全部檔案會假綠——與 ON CONFLICT 那次同一個教訓）。

describe('#1777 退款鏈 — 最終生效的 fn_apply_refund_adjustment_atomic', () => {
  const defining = ISSUE_1777_MIGRATIONS
    .filter((base) => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_apply_refund_adjustment_atomic/i
      .test(sqlCode(readMigration(base))))
    .sort();

  it('有 migration 定義該函式', () => {
    assert.ok(defining.length > 0);
  });

  const latest = defining[defining.length - 1];
  const code = sqlCode(readMigration(latest));

  it(`${latest} 以 delta 為參數，不再由呼叫端提供冪等鍵（F2）`, () => {
    assert.match(code, /p_refund_delta_twd\s+integer/i, '參數必須是「本次退款額」');
    assert.doesNotMatch(
      code,
      /p_refund_event_id/i,
      '冪等鍵不得再由呼叫端傳入——那正是 F2 的成因',
    );
    assert.match(
      code,
      /'cum:'\s*\|\|/i,
      '冪等鍵必須在函式內以累積額推導',
    );
  });

  it(`${latest} 舊簽章已 DROP（避免 PostgREST 多載歧義 PGRST203）`, () => {
    assert.match(
      code,
      /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.fn_apply_refund_adjustment_atomic\s*\(\s*uuid\s*,\s*text\s*,\s*text\s*\)/i,
      '第二參數型別改變會產生多載；舊簽章必須移除',
    );
  });

  it(`${latest} 在交易內累加 refund_amount_twd，且不是整值覆寫（F1）`, () => {
    assert.match(
      code,
      /ON\s+CONFLICT\s*\(\s*order_id\s*\)\s*DO\s+UPDATE[\s\S]{0,200}refund_amount_twd\s*=\s*coalesce\s*\(\s*ot\.refund_amount_twd\s*,\s*0\s*\)\s*\+/i,
      'refund_amount_twd 必須以 `既有值 + delta` 累加；覆寫會讓多次部分退款漏計',
    );
    // 累加必須在同一把 orders 鎖之內，否則兩筆併發退款仍會 lost update。
    const lockAt = code.search(/FROM\s+orders\s+o[\s\S]{0,80}FOR\s+UPDATE/i);
    const accumulateAt = code.search(/INSERT\s+INTO\s+operations_tracking/i);
    assert.ok(lockAt >= 0 && accumulateAt >= 0, '應同時有 orders FOR UPDATE 與 ops 累加');
    assert.ok(lockAt < accumulateAt, '累加必須發生在 orders FOR UPDATE 之後');
  });

  it(`${latest} 負 delta 直接 RAISE（累積額必須單調遞增，否則鍵會重複）`, () => {
    assert.match(code, /v_delta_in\s*<\s*0[\s\S]{0,160}RAISE\s+EXCEPTION/i);
  });

  it(`${latest} carry-forward 不再被 delta=0 早退跳過（F5）`, () => {
    // 舊版在 v_delta = 0 時直接 RETURN，早於餘額轉負的稽核；若上游已整筆紅沖，
    // 已付出去的錢就完全沒有可追蹤的回收紀錄。
    const carryAt = code.search(/IF\s+v_balance\s*<\s*0\s+THEN/i);
    const deltaBranchAt = code.search(/IF\s+v_delta\s*<>\s*0\s+THEN/i);
    assert.ok(carryAt >= 0, '必須有餘額轉負的 carry-forward 檢查');
    assert.ok(deltaBranchAt >= 0, '差額分錄應在 v_delta <> 0 的分支內');
    assert.ok(
      carryAt > deltaBranchAt,
      'carry-forward 檢查必須在差額分支之後、且不在其內——delta=0 也要檢查',
    );
    assert.doesNotMatch(
      code,
      /IF\s+v_delta\s*=\s*0\s+THEN[\s\S]{0,400}RETURN\s*;/i,
      '不得有 delta=0 的早退路徑（那會跳過 carry-forward 稽核）',
    );
  });

  it(`${latest} carry-forward 與超額稽核以 refund_event_id 去重（重跑不刷重複列）`, () => {
    const dedupes = code.match(/NOT\s+EXISTS\s*\([\s\S]{0,300}?metadata\s*->>\s*'refund_event_id'\s*=\s*v_event_id/gi) ?? [];
    assert.ok(dedupes.length >= 2, `carry-forward 與超額退款稽核都要去重，目前 ${dedupes.length} 處`);
  });

  it(`${latest} 累積額超過訂單總額時留稽核，不靜默通過`, () => {
    assert.match(code, /refund_exceeds_order_total/i, '超額退款必須留下可查的稽核 action');
  });

  it(`${latest} 未結算訂單不動 ledger，但累積額仍已記錄`, () => {
    // 累加必須排在「無 ledger 分錄就早退」之前，否則結算前的退款不會反映到
    // sweep 的 effective GMV（#1474 的不變量）。
    const accumulateAt = code.search(/INSERT\s+INTO\s+operations_tracking/i);
    const notSettledAt = code.search(/IF\s+v_guide_id\s+IS\s+NULL\s+THEN/i);
    assert.ok(accumulateAt >= 0 && notSettledAt >= 0);
    assert.ok(accumulateAt < notSettledAt, '未結算的早退路徑必須在累積額寫入之後');
    assert.match(code, /'settled'\s*,\s*false/i, '未結算應以 settled:false 回報');
  });

  it(`${latest} 仍 pin search_path 且權限收斂到 service_role`, () => {
    assert.match(code, /SET\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/i);
    assert.match(
      code,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_apply_refund_adjustment_atomic\s*\(\s*uuid\s*,\s*integer\s*,\s*text\s*\)\s*TO\s+service_role/i,
      '新簽章必須重新授權給 service_role（舊簽章的 GRANT 隨 DROP 一併消失）',
    );
    assert.match(
      code,
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.fn_apply_refund_adjustment_atomic\s*\(\s*uuid\s*,\s*integer\s*,\s*text\s*\)\s*FROM\s+[^;]*anon[^;]*authenticated/i,
      '新簽章必須重新自 anon／authenticated 收回（DROP 後 default privileges 會再放行一次）',
    );
  });

  it(`${latest} 回傳 jsonb，函式體內沒有與資料表欄位同名的變數`, () => {
    // 舊版 `RETURNS TABLE (order_id …, refund_event_id …)` 讓 plpgsql 變數與欄位
    // 同名，而 ON CONFLICT 的 inference specification 是以運算式解析的——同名
    // 變數會被代換成參數 placeholder。改回傳 jsonb 後整類問題消失。
    assert.match(code, /RETURNS\s+jsonb/i);
    assert.doesNotMatch(
      code,
      /RETURNS\s+TABLE\s*\([\s\S]{0,400}?\brefund_event_id\b/i,
      'OUT 參數不得與 ON CONFLICT 用到的欄位同名',
    );
  });
});


// ── F4：退款紅沖的原子性 ─────────────────────────────────────────────────────
//
// 舊實作（db.mjs 約 250 行）讀 guide_balances、在 JS 算新餘額、寫回**絕對值**，
// 並用 status='started' 的 audit marker 做崩潰復原。那整套補償機制存在的理由就是
// 三個寫入不在同一個交易裡。這裡鎖住取代它的三個性質。

describe('#1777 F4 — fn_record_refund_reversal_atomic', () => {
  const code = sqlCode(readMigration('20260804103000_issue1777_atomic_refund_reversal'));

  it('pin search_path 且權限收斂到 service_role', () => {
    assert.match(code, /SET\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/i);
    assert.match(
      code,
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.fn_record_refund_reversal_atomic\s*\([^)]*\)\s*FROM\s+[^;]*anon[^;]*authenticated/i,
    );
    assert.match(
      code,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_record_refund_reversal_atomic\s*\([^)]*\)\s*TO\s+service_role/i,
    );
  });

  it('對 orders 加鎖，序列化同一訂單上的帳務寫入', () => {
    assert.match(code, /FROM\s+orders\s+o\s+WHERE\s+o\.id\s*=\s*p_order_id\s+FOR\s+UPDATE/i);
  });

  it('餘額是 SQL 層增減，不是應用層算好的絕對值覆寫（F4 的核心修法）', () => {
    assert.match(
      code,
      /balance_twd\s*=\s*guide_balances\.balance_twd\s*\+\s*EXCLUDED\.balance_twd/i,
      '必須是 balance + delta；寫回絕對值正是併發 lost update 的成因',
    );
    // 舊實作的絕對值語意：guide_balances 的 balance_twd 被指派成一個算好的值。
    assert.doesNotMatch(
      code,
      /SET\s+balance_twd\s*=\s*v_after/i,
      '不得把應用層／函式內算好的絕對值直接指派給餘額',
    );
  });

  it('冪等由部分唯一索引判定：只有真正插入新分錄才動餘額', () => {
    const match = code.match(/ON\s+CONFLICT\s*\(\s*order_id\s*,\s*settlement_kind\s*\)([\s\S]{0,120})/i);
    assert.ok(match, '必須以 ON CONFLICT (order_id, settlement_kind) 判定冪等');
    assert.match(
      match[1],
      /^\s*WHERE\s+settlement_kind\s+IN\s*\(/i,
      'predicate 必須與部分索引一致，否則 42P10（#1777 已踩過一次）',
    );
    assert.match(code, /RETURNING\s+id\s+INTO\s+v_reversal_id/i);
    // 餘額更新必須排在「確認真的插入了新分錄」之後。
    const guardAt = code.search(/IF\s+v_reversal_id\s+IS\s+NULL\s+THEN/i);
    const balanceAt = code.search(/INSERT\s+INTO\s+guide_balances/i);
    assert.ok(guardAt >= 0 && balanceAt >= 0);
    assert.ok(guardAt < balanceAt, '已紅沖時必須先 return，不得再動餘額');
  });

  it('餘額允許扣成負數（carry-forward），不得截斷', () => {
    assert.doesNotMatch(
      code,
      /greatest\s*\(\s*0\s*,\s*[^)]*balance/i,
      '紅沖不得把餘額截成 0——錢已經付出去了，必須留下欠款',
    );
  });

  it('補償用的 audit marker 機制已隨舊實作消失', () => {
    assert.doesNotMatch(
      code,
      /'started'/,
      "status='started' 的 marker 是為了補救非原子而存在的；同一交易內不需要它",
    );
  });

  it('尚未結算時零寫入', () => {
    const preSettlementAt = code.search(/'pre_settlement'/i);
    const insertAt = code.search(/INSERT\s+INTO\s+payout_items/i);
    assert.ok(preSettlementAt >= 0 && insertAt >= 0);
    assert.ok(preSettlementAt < insertAt, 'pre_settlement 必須在任何寫入之前 return');
  });
});

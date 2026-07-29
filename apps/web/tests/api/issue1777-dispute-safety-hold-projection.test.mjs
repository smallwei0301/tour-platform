/**
 * Issue #1777 Phase 1 — dispute／safety hold 必須真正阻擋結算。
 *
 * 缺口（#1777 缺口 1）：
 *   `operations_tracking.is_disputed` / `is_safety_case` 早在 migration
 *   20260618_operations_tracking_dispute_safety_flags.sql 就已是實體欄位，
 *   `isPayoutOnHold`（post-trip-eligibility.mjs:90-91）也把這兩者列為最高
 *   優先的 hold 理由，`computeSweepPayoutItem`（settlement-config.ts:234-241）
 *   同樣已把它們傳進 gate。但 settlement sweep 的 select 只投影
 *   `refund_amount_twd, has_complaint, has_oversell_issue`——PostgREST 只回傳
 *   被 select 的欄位，於是這兩欄以 `undefined` 抵達 gate，`=== true` 恆為
 *   false，dispute／safety hold **從未觸發**。
 *
 *   結果：導遊 dashboard（computeGuidePayoutEstimate 讀滿四旗標）顯示
 *   `payment_dispute` / `safety_review` hold，實際 sweep 卻照常把該訂單結算
 *   入帳——跨介面語意分裂，且付款爭議／安全案件的錢會被真的撥出去。
 *
 * 測試策略（刻意不做 source-string 斷言）：
 *   從 sweep route 解析出**實際投影的欄位清單**，據此把一筆完整的 DB row
 *   裁切成「PostgREST 真正會回傳的形狀」，再餵進 computeSweepPayoutItem 斷言
 *   最終行為（是否產生 payout item）。投影漏欄 → 裁切後該欄 undefined →
 *   行為斷言自然轉紅。這條「投影 → 資料形狀 → 結算行為」的因果鏈是真實的，
 *   而不是比對原始碼長什麼樣（#1777 明列「測試不可只驗 source string」）。
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SWEEP_ROUTE_PATH = join(__dirname, '../../app/api/internal/settlement/sweep/route.ts');

/** sweep route 的 select() 中 operations_tracking(...) 實際投影的欄位清單。 */
function sweepProjectedOpsColumns() {
  const src = readFileSync(SWEEP_ROUTE_PATH, 'utf8');
  // 匹配查詢投影 `operations_tracking(...)`，不是 TS 型別註記
  // `operations_tracking?: { ... }`。
  const match = src.match(/operations_tracking\(([^)]*)\)/);
  assert.ok(match, 'sweep route 必須有 operations_tracking(...) 投影');
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 模擬 PostgREST 行為：只回傳被 select 的欄位。
 * 未投影的欄位不會出現在結果物件上（等同 undefined）——這正是缺口的成因。
 */
function asPostgrestRow(fullDbRow) {
  const projected = sweepProjectedOpsColumns();
  const row = {};
  for (const col of projected) {
    if (Object.hasOwn(fullDbRow, col)) row[col] = fullDbRow[col];
  }
  return row;
}

async function loadHelpers() {
  const mod = await import('../../src/lib/settlement-config.ts');
  return { computeSweepPayoutItem: mod.computeSweepPayoutItem, computeGuidePayoutEstimate: mod.computeGuidePayoutEstimate };
}

const CONFIG = { commission_rate: 0.15, version: 'v1' };
const ORDER = { id: 'o-1777', total_twd: 10000, guide_id: 'g-1777' };

/** operations_tracking 的完整實體欄位（migration 001/002 + 20260618）。 */
function opsRow(overrides = {}) {
  return {
    refund_amount_twd: 0,
    has_complaint: false,
    has_oversell_issue: false,
    is_disputed: false,
    is_safety_case: false,
    ...overrides,
  };
}

describe('#1777 缺口 1 — sweep 必須把 dispute／safety hold 投影進結算', () => {
  it('is_disputed=true 的訂單不得產生 payout item（付款爭議不得撥款）', async () => {
    const { computeSweepPayoutItem } = await loadHelpers();
    const projected = asPostgrestRow(opsRow({ is_disputed: true }));
    const item = computeSweepPayoutItem(ORDER, projected, CONFIG);
    assert.equal(
      item,
      null,
      '付款爭議中的訂單被結算入帳：sweep 未投影 is_disputed，hold gate 收到 undefined 而未觸發',
    );
  });

  it('is_safety_case=true 的訂單不得產生 payout item（安全案件不得撥款）', async () => {
    const { computeSweepPayoutItem } = await loadHelpers();
    const projected = asPostgrestRow(opsRow({ is_safety_case: true }));
    const item = computeSweepPayoutItem(ORDER, projected, CONFIG);
    assert.equal(
      item,
      null,
      '安全案件中的訂單被結算入帳：sweep 未投影 is_safety_case，hold gate 收到 undefined 而未觸發',
    );
  });

  it('既有的 complaint／oversell hold 不得迴歸', async () => {
    const { computeSweepPayoutItem } = await loadHelpers();
    for (const flag of ['has_complaint', 'has_oversell_issue']) {
      const projected = asPostgrestRow(opsRow({ [flag]: true }));
      assert.equal(
        computeSweepPayoutItem(ORDER, projected, CONFIG),
        null,
        `${flag}=true 仍必須擋下結算（#1221／#1106 既有行為）`,
      );
    }
  });

  it('無任何 hold 的乾淨訂單仍正常結算（不得誤擋）', async () => {
    const { computeSweepPayoutItem } = await loadHelpers();
    const item = computeSweepPayoutItem(ORDER, asPostgrestRow(opsRow()), CONFIG);
    assert.ok(item, '乾淨的 completed 訂單必須照常結算');
    assert.equal(item.net_twd, 8500, 'net = floor(10000 × (1 − 0.15))');
  });

  it('部分退款（無 hold）仍按有效金額縮減結算（#847 不得迴歸）', async () => {
    const { computeSweepPayoutItem } = await loadHelpers();
    const item = computeSweepPayoutItem(ORDER, asPostgrestRow(opsRow({ refund_amount_twd: 2000 })), CONFIG);
    assert.ok(item, '部分退款且無 hold 的訂單仍應結算');
    assert.equal(item.gmv_twd, 8000, 'effective gmv = 10000 − 2000');
    assert.equal(item.net_twd, 6800, 'net = floor(8000 × (1 − 0.15))');
  });
});

// ── 跨介面對齊契約（#1777 AC：sweep 的 hold 必須與導遊端完全一致）────────────

describe('#1777 — 導遊端顯示 hold ⇔ sweep 不得入帳', () => {
  const HOLD_CASES = [
    { name: 'is_disputed', row: opsRow({ is_disputed: true }) },
    { name: 'is_safety_case', row: opsRow({ is_safety_case: true }) },
    { name: 'has_complaint', row: opsRow({ has_complaint: true }) },
    { name: 'has_oversell_issue', row: opsRow({ has_oversell_issue: true }) },
    { name: 'no_hold', row: opsRow() },
    { name: 'partial_refund', row: opsRow({ refund_amount_twd: 2000 }) },
    { name: 'full_refund', row: opsRow({ refund_amount_twd: 10000 }) },
  ];

  for (const { name, row } of HOLD_CASES) {
    it(`${name}：導遊端 payableNetTwd=0 ⇔ sweep 無 payout item`, async () => {
      const { computeSweepPayoutItem, computeGuidePayoutEstimate } = await loadHelpers();

      // 導遊端讀完整 ops row（dashboard／monthly JSON／CSV 共用此 helper）
      const estimate = computeGuidePayoutEstimate({ total_twd: ORDER.total_twd }, row, CONFIG);
      // sweep 端只拿得到自己投影的欄位
      const item = computeSweepPayoutItem(ORDER, asPostgrestRow(row), CONFIG);

      const guideSaysUnpayable = estimate.payableNetTwd === 0;
      const sweepSaysUnpayable = item === null;

      assert.equal(
        sweepSaysUnpayable,
        guideSaysUnpayable,
        `跨介面分裂：導遊端 payableNetTwd=${estimate.payableNetTwd}`
          + `（hold=${estimate.payoutHoldReason}）但 sweep ${item ? `結算 net=${item.net_twd}` : '未結算'}`,
      );

      // 可付款時，兩邊金額也必須一致（不只是 payable 與否一致）
      if (!guideSaysUnpayable) {
        assert.equal(item.net_twd, estimate.payableNetTwd, '導遊端預估金額必須等於 sweep 實際結算金額');
      }
    });
  }
});

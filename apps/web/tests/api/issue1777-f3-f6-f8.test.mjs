/**
 * Issue #1777 — 收尾三項：F3（結算金額信任呼叫端）／F6（對帳的結構盲點）／
 * F8（JS 浮點與 SQL numeric 的 floor 分歧）。
 *
 * 三者都不是「現在正在錯帳」，而是**下一次一定會踩到**的結構問題：
 *   F3 金額的真實來源在應用層，DB 只驗資格不驗金額 → 決策 C「RPC 是唯一 writer」
 *      留了後門；且資格用交易內資料、金額用交易外資料，兩者可能來自不同時點。
 *   F6 對帳只看得見「已進 ledger」的訂單，因此結構上無法回答「該入帳的有沒有漏掉」。
 *      漏結算的三方金額全是 0 → 三方對帳一定「一致」→ 一整批漏結算看起來完全正常。
 *   F8 rate=0.30 時 `Math.floor(e × (1 − 0.30))` 與 SQL numeric 分歧，導遊少拿 NT$1，
 *      且導遊看到的估算與實際結算不同數字。目前 active rate=0.15 分歧數為 0。
 *
 * Run: node --test apps/web/tests/api/issue1777-f3-f6-f8.test.mjs
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, '../../../../supabase/migrations');
const sqlCode = (s) => s.replace(/--.*$/gm, '');

// ── F8：整數基點運算 ────────────────────────────────────────────────────────

describe('#1777 F8 — 浮點與 numeric 的 floor 分歧', () => {
  it('rate=0.30、effective=90：浮點少算 NT$1（問題重現）', () => {
    // 1 - 0.30 在 IEEE754 是 0.6999999999999999556…
    assert.equal(Math.floor(90 * (1 - 0.30)), 62, '浮點結果');
    // SQL numeric：90 × 0.7000 = 63.0000 → floor 63
    assert.equal(Math.floor((90 * (10000 - 3000)) / 10000), 63, '精確結果');
  });

  it('computeNetTwd 用整數基點運算，給出與 SQL 一致的答案', async () => {
    const { computeNetTwd } = await import('../../src/lib/settlement/money.mjs');
    assert.equal(computeNetTwd(90, 0.30), 63, '不得再是 62');
  });

  it('rate=0.30 在 1..200000 全域與精確值一致（浮點版有 4,676 個分歧）', async () => {
    const { computeNetTwd } = await import('../../src/lib/settlement/money.mjs');
    let exactDiffs = 0;
    let floatDiffs = 0;
    for (let e = 1; e <= 200000; e += 1) {
      const exact = Math.floor((e * 7000) / 10000);
      if (computeNetTwd(e, 0.30) !== exact) exactDiffs += 1;
      if (Math.floor(e * (1 - 0.30)) !== exact) floatDiffs += 1;
    }
    assert.equal(exactDiffs, 0, 'computeNetTwd 必須逐值精確');
    assert.equal(floatDiffs, 4676, '浮點版的分歧數（鎖住問題規模，避免日後被說成不存在）');
  });

  it('rate=0.15（目前 active）本來就沒有分歧——這是個未觸發的陷阱，不是現存錯帳', async () => {
    const { computeNetTwd } = await import('../../src/lib/settlement/money.mjs');
    let floatDiffs = 0;
    for (let e = 1; e <= 200000; e += 1) {
      if (Math.floor(e * (1 - 0.15)) !== computeNetTwd(e, 0.15)) floatDiffs += 1;
    }
    assert.equal(floatDiffs, 0);
  });

  it('commission 與 net 各自 floor，殘差歸平台（gmv ≠ commission + net 屬預期）', async () => {
    const { computeCommissionTwd, computeNetTwd } = await import('../../src/lib/settlement/money.mjs');
    const e = 333;
    assert.equal(computeCommissionTwd(e, 0.15), 49);
    assert.equal(computeNetTwd(e, 0.15), 283);
    assert.equal(49 + 283, 332, '殘差 1 歸平台');
  });

  it('sweep 與導遊估算共用同一套運算（跨介面不得分歧）', async () => {
    const { computeSweepPayoutItem, computeGuidePayoutEstimate } =
      await import('../../src/lib/settlement-config.ts');
    const config = { commission_rate: 0.30, version: 'v1' };
    const order = { id: 'o-1', total_twd: 90, guide_id: 'g-1' };
    const ops = { refund_amount_twd: 0 };

    const sweep = computeSweepPayoutItem(order, ops, config);
    const estimate = computeGuidePayoutEstimate(order, ops, config);
    assert.equal(sweep.net_twd, 63);
    assert.equal(estimate.netTwd, sweep.net_twd, '導遊看到的數字必須等於實際結算');
  });

  it('對帳的目標值也用同一套運算', async () => {
    const { targetNetPayable } = await import('../../src/lib/accounting/reconciliation.mjs');
    assert.equal(targetNetPayable(90, 0, 0.30), 63);
  });
});

// ── F3：結算金額必須由 DB 端重算 ────────────────────────────────────────────

describe('#1777 F3 — 結算金額不得信任呼叫端', () => {
  const code = sqlCode(
    readFileSync(join(MIGRATIONS, '20260804113000_issue1777_settlement_recompute_amounts.sql'), 'utf8'),
  );

  it('金額在交易內重算，與資格重驗用同一份資料', () => {
    assert.match(code, /v_effective\s*:=\s*greatest\(0,\s*coalesce\(v_order_total,\s*0\)\s*-\s*v_refund\)/i);
    assert.match(code, /v_commission\s*:=\s*floor\(v_effective\s*\*\s*v_rate\)/i);
    assert.match(code, /v_net\s*:=\s*floor\(v_effective\s*\*\s*\(1\s*-\s*v_rate\)\)/i);
  });

  it('分潤率取自交易內的 settlement_rules active 列，不由呼叫端指定', () => {
    assert.match(code, /FROM\s+settlement_rules\s+sr\s+WHERE\s+sr\.is_active\s*=\s*true/i);
    assert.doesNotMatch(
      code,
      /coalesce\(v_item\s*->>\s*'rules_version'/i,
      'rules_version 不得再由呼叫端指定',
    );
  });

  it('INSERT 用的是重算值，不是 p_items 的金額', () => {
    const insertBlock = code.match(/INSERT\s+INTO\s+payout_items[\s\S]*?VALUES\s*\(([\s\S]*?)\)\s*ON\s+CONFLICT/i);
    assert.ok(insertBlock, '應有 payout_items INSERT');
    assert.doesNotMatch(
      insertBlock[1],
      /v_item\s*->>/i,
      'VALUES 不得直接取 p_items 的金額欄位',
    );
    assert.match(insertBlock[1], /v_gmv/);
    assert.match(insertBlock[1], /v_commission/);
    assert.match(insertBlock[1], /v_net/);
  });

  it('呼叫端傳值僅作對照，不一致時留稽核（同時是 F8 的偵測器）', () => {
    assert.match(code, /settlement_amount_mismatch/);
    assert.match(code, /claimed_gmv_twd/);
    assert.match(code, /computed_net_twd/);
  });

  it('金額不符不阻斷結算（DB 算的才是對的）', () => {
    // mismatch 的 audit 必須排在 INSERT 之前，且不得 RAISE。
    const mismatchAt = code.search(/settlement_amount_mismatch/i);
    const insertAt = code.search(/INSERT\s+INTO\s+payout_items/i);
    assert.ok(mismatchAt >= 0 && insertAt >= 0);
    assert.ok(mismatchAt < insertAt, '稽核先寫，結算照常進行');
    const between = code.slice(mismatchAt, insertAt);
    assert.doesNotMatch(between, /RAISE\s+EXCEPTION/i, '金額不符不得中止結算');
  });

  it('ON CONFLICT 仍帶 predicate（不得回退成 42P10）', () => {
    const m = code.match(/ON\s+CONFLICT\s*\(\s*order_id\s*,\s*settlement_kind\s*\)([\s\S]{0,120})/i);
    assert.ok(m);
    assert.match(m[1], /^\s*WHERE\s+settlement_kind\s+IN\s*\(/i);
  });

  it('資格重驗與加鎖逐字保留', () => {
    for (const flag of ['is_disputed', 'is_safety_case', 'has_complaint', 'has_oversell_issue']) {
      assert.match(code, new RegExp(flag));
    }
    assert.match(code, /paid_at\s+IS\s+NULL/i);
    assert.match(code, /FOR\s+UPDATE/i);
    assert.match(code, /balance_twd\s*=\s*guide_balances\.balance_twd\s*\+/i);
  });
});

// ── F6：漏結算稽核 ──────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const ASOF = '2026-08-04T00:00:00.000Z';
const longAgo = new Date(Date.parse(ASOF) - 30 * DAY).toISOString();
const yesterday = new Date(Date.parse(ASOF) - 1 * DAY).toISOString();

function eligibleOrder(overrides = {}) {
  return {
    id: 'o-missed',
    status: 'completed',
    paid_at: longAgo,
    total_twd: 10000,
    refund_amount_twd: 0,
    eligible_since: longAgo,
    is_disputed: false,
    is_safety_case: false,
    has_complaint: false,
    has_oversell_issue: false,
    ...overrides,
  };
}

describe('#1777 F6 — 「該結算卻沒結算」的偵測', () => {
  it('舊的兩支對帳結構上看不見漏結算（問題重現）', async () => {
    const { buildOrderReconciliation, buildEligibilityAudit } =
      await import('../../src/lib/accounting/reconciliation.mjs');
    const orders = [eligibleOrder()];

    // 完全沒有 ledger 分錄
    const order = buildOrderReconciliation({ orders, ledgerRows: [], commissionRate: 0.15 });
    const eligibility = buildEligibilityAudit({ orders, ledgerRows: [] });

    assert.equal(order.totals.checkedCount, 0, '沒有分錄的訂單根本進不了迴圈');
    assert.equal(order.totals.mismatchCount, 0);
    assert.equal(eligibility.totals.flaggedCount, 0);
    // 三方金額全是 0，因此「一致」——漏結算在舊報表裡完全隱形。
  });

  it('新稽核抓得到：該結算卻沒有任何分錄', async () => {
    const { buildMissedSettlementAudit } = await import('../../src/lib/accounting/reconciliation.mjs');
    const out = buildMissedSettlementAudit({
      orders: [eligibleOrder()], ledgerRows: [], commissionRate: 0.15, tDays: 7, asOf: ASOF,
    });
    assert.equal(out.evaluated, true);
    assert.equal(out.totals.missedCount, 1);
    assert.equal(out.totals.missedNetTwd, 8500, 'floor(10000 × 0.85)');
    assert.equal(out.orders[0].orderIdMasked, 'o-missed', 'maskId 對 ≤8 字元原樣保留');
  });

  it('已有分錄的訂單不算漏結算', async () => {
    const { buildMissedSettlementAudit } = await import('../../src/lib/accounting/reconciliation.mjs');
    const out = buildMissedSettlementAudit({
      orders: [eligibleOrder()], ledgerRows: [{ order_id: 'o-missed' }], asOf: ASOF,
    });
    assert.equal(out.totals.missedCount, 0);
    assert.equal(out.totals.checkedCount, 0);
  });


  for (const [label, patch] of [
    ['未實收', { paid_at: null }],
    ['狀態非 completed', { status: 'confirmed' }],
    ['付款爭議', { is_disputed: true }],
    ['安全案件', { is_safety_case: true }],
    ['客訴中', { has_complaint: true }],
    ['超賣調查中', { has_oversell_issue: true }],
    ['已全額退款', { refund_amount_twd: 10000 }],
    ['尚未到 T+7', { eligible_since: yesterday }],
  ]) {
    it(`${label} → 不算漏結算`, async () => {
      const { buildMissedSettlementAudit } = await import('../../src/lib/accounting/reconciliation.mjs');
      const out = buildMissedSettlementAudit({
        orders: [eligibleOrder(patch)], ledgerRows: [], tDays: 7, asOf: ASOF,
      });
      assert.equal(out.totals.missedCount, 0, `${label} 不該被誤報`);
    });
  }

  it('算不出 eligible_since → 獨立歸為 notEvaluable，不得混進「沒事」', async () => {
    const { buildMissedSettlementAudit } = await import('../../src/lib/accounting/reconciliation.mjs');
    const out = buildMissedSettlementAudit({
      orders: [eligibleOrder({ eligible_since: null })], ledgerRows: [], tDays: 7, asOf: ASOF,
    });
    // sweep 用的也是同一個欄位，因此這種訂單 sweep 同樣評估不了 ⇒ 永遠不會結算。
    assert.equal(out.totals.missedCount, 0, '不是「已確認漏結算」');
    assert.equal(out.totals.notEvaluableCount, 1, '但也絕不算通過');
    assert.equal(out.totals.notEvaluableNetTwd, 8500);
    assert.equal(out.orders[0].notEvaluable, true);
    assert.equal(out.orders[0].needsAttention, false);
  });

  it('已在其他理由下不該結算者，不會被誤標成 notEvaluable', async () => {
    const { buildMissedSettlementAudit } = await import('../../src/lib/accounting/reconciliation.mjs');
    // 全額退款 ＋ 沒有 eligible_since：本來就不該結算，不是「無法評估」
    const out = buildMissedSettlementAudit({
      orders: [eligibleOrder({ eligible_since: null, refund_amount_twd: 10000 })],
      ledgerRows: [], tDays: 7, asOf: ASOF,
    });
    assert.equal(out.totals.notEvaluableCount, 0);
    assert.equal(out.totals.missedCount, 0);
  });

  it('notEvaluable 也讓報表的 ok 為 false', async () => {
    const { buildMissedSettlementAudit, buildReconciliationReport } =
      await import('../../src/lib/accounting/reconciliation.mjs');
    const audit = buildMissedSettlementAudit({
      orders: [eligibleOrder({ eligible_since: null })], ledgerRows: [], asOf: ASOF,
    });
    const report = buildReconciliationReport({
      guideReconciliation: { mismatchCount: 0, guides: [], totals: {} },
      orderReconciliation: { orders: [], totals: { mismatchCount: 0 } },
      eligibilityAudit: { orders: [], totals: { needsAttentionCount: 0 } },
      missedSettlementAudit: audit,
    });
    assert.equal(report.ok, false, '永遠不會結算的訂單不能算通過');
    assert.equal(report.notEvaluableSettlementCount, 1);
  });

  it('缺 asOf 時回 evaluated:false，不猜也不下結論', async () => {
    const { buildMissedSettlementAudit } = await import('../../src/lib/accounting/reconciliation.mjs');
    const out = buildMissedSettlementAudit({ orders: [eligibleOrder()], ledgerRows: [] });
    assert.equal(out.evaluated, false);
    assert.equal(out.totals.missedCount, 0);
  });

  it('報表的 ok 納入漏結算——否則一整批漏結算會看起來完全正常', async () => {
    const { buildMissedSettlementAudit, buildReconciliationReport } =
      await import('../../src/lib/accounting/reconciliation.mjs');
    const missed = buildMissedSettlementAudit({
      orders: [eligibleOrder()], ledgerRows: [], asOf: ASOF,
    });
    const report = buildReconciliationReport({
      guideReconciliation: { mismatchCount: 0, guides: [], totals: {} },
      orderReconciliation: { orders: [], totals: { mismatchCount: 0 } },
      eligibilityAudit: { orders: [], totals: { needsAttentionCount: 0 } },
      missedSettlementAudit: missed,
    });
    assert.equal(report.ok, false, '三方金額都一致（都是 0），但錢確實漏付了');
    assert.equal(report.missedSettlementCount, 1);
    assert.equal(report.missedSettlementEvaluated, true);
  });

  it('未提供漏結算稽核時，誠實標示「這面向沒檢查」而非默默當通過', async () => {
    const { buildReconciliationReport } = await import('../../src/lib/accounting/reconciliation.mjs');
    const report = buildReconciliationReport({
      guideReconciliation: { mismatchCount: 0, guides: [], totals: {} },
      orderReconciliation: { orders: [], totals: { mismatchCount: 0 } },
      eligibilityAudit: { orders: [], totals: { needsAttentionCount: 0 } },
    });
    assert.equal(report.missedSettlementEvaluated, false);
    assert.equal(report.ok, true, '其餘三項通過仍可為 true，但已標示未檢查');
  });
});

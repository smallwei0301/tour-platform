/**
 * #1777 Phase 4 — 財務對帳（純函式，無 DB、無副作用）。
 *
 * 回答一個問題：**ledger、導遊餘額、出款單三者是否一致？**
 *
 * 不變量（invariant）：
 *   期望餘額 = Σ payout_items.net_twd（該導遊全部分錄）− Σ 已付出款金額
 *
 * 任何偏離都代表某一步只寫了一半、或歷史上曾以非原子路徑寫入（#1777 缺口 3／4
 * 正是成因）。#1777 Phase 2／3 讓新寫入不可能再產生偏離，但**既有的歷史偏離
 * 不會自己消失**——這支報表就是用來把它們找出來的。
 *
 * 另有訂單層級的檢查：每張訂單的 ledger 淨額是否等於
 *   floor(max(0, total − 累積退款) × (1 − 分潤率))
 * 亦即 owner 決策 B 的目標值。偏離代表該訂單的退款差額尚未套用（Phase 3 之前
 * 的全額紅沖遺留），或曾被重複記帳。
 *
 * Privacy：本模組只處理識別碼與金額，輸出一律遮罩識別碼、不含姓名／email／
 * 付款明細（#1777 safety 條款：報告只放彙總或遮罩後識別碼）。
 */

import { computeNetTwd, effectiveGmvTwd } from '../settlement/money.mjs';

/** 遮罩 UUID／識別碼，只保留前 8 碼供人工追查。 */
export function maskId(id) {
  const s = String(id ?? '');
  if (!s) return null;
  return s.length <= 8 ? s : `${s.slice(0, 8)}…`;
}

/**
 * 目標導遊淨應付（owner 決策 B）。
 * 整數規則與 computeSweepPayoutItem／fn_apply_refund_adjustment_atomic 一致：
 * commission 與 net 各自 floor、殘差歸平台，因此 gmv ≠ commission + net 屬預期。
 *
 * @param {number} totalTwd 訂單總額
 * @param {number} refundTwd 累積退款額
 * @param {number} commissionRate 分潤率（平台抽成）
 * @returns {number}
 */
export function targetNetPayable(totalTwd, refundTwd, commissionRate) {
  // #1777 F8：整數基點運算，與 DB 端 numeric 逐值一致（浮點在 rate=0.30 會少算 NT$1）。
  return computeNetTwd(effectiveGmvTwd(totalTwd, refundTwd), commissionRate);
}

/**
 * 逐導遊比對 ledger／餘額／出款。
 *
 * @param {{
 *   ledgerRows: Array<{guide_id: string, net_twd: number}>,
 *   balanceRows: Array<{guide_id: string, balance_twd: number}>,
 *   paidPayouts: Array<{guide_id: string, total_twd: number}>,
 *   pendingPayouts: Array<{guide_id: string, total_twd: number}>,
 * }} input
 * @returns {{
 *   guides: Array<object>, totals: object, mismatchCount: number,
 * }}
 */
export function buildGuideReconciliation({
  ledgerRows = [],
  balanceRows = [],
  paidPayouts = [],
  pendingPayouts = [],
} = {}) {
  const sumBy = (rows, key, field) => {
    const acc = new Map();
    for (const row of rows) {
      const k = row?.[key];
      if (!k) continue;
      acc.set(k, (acc.get(k) ?? 0) + (Number(row?.[field]) || 0));
    }
    return acc;
  };

  const ledgerNetByGuide = sumBy(ledgerRows, 'guide_id', 'net_twd');
  const paidByGuide = sumBy(paidPayouts, 'guide_id', 'total_twd');
  const pendingByGuide = sumBy(pendingPayouts, 'guide_id', 'total_twd');
  const balanceByGuide = new Map(
    balanceRows.filter((r) => r?.guide_id).map((r) => [r.guide_id, Number(r.balance_twd) || 0]),
  );

  const guideIds = [...new Set([
    ...ledgerNetByGuide.keys(),
    ...paidByGuide.keys(),
    ...pendingByGuide.keys(),
    ...balanceByGuide.keys(),
  ])];

  const guides = guideIds.map((guideId) => {
    const ledgerNetTwd = ledgerNetByGuide.get(guideId) ?? 0;
    const paidOutTwd = paidByGuide.get(guideId) ?? 0;
    const pendingPayoutTwd = pendingByGuide.get(guideId) ?? 0;
    const actualBalanceTwd = balanceByGuide.get(guideId) ?? 0;
    const expectedBalanceTwd = ledgerNetTwd - paidOutTwd;
    const diffTwd = actualBalanceTwd - expectedBalanceTwd;

    const issues = [];
    if (diffTwd !== 0) issues.push('balance_ledger_mismatch');
    // 待出款金額超過現有餘額＝出款單是舊快照，confirm 會扣出負數或被擋下
    if (pendingPayoutTwd > actualBalanceTwd) issues.push('pending_payout_exceeds_balance');
    if (actualBalanceTwd < 0) issues.push('negative_balance_carry_forward');

    return {
      guideIdMasked: maskId(guideId),
      ledgerNetTwd,
      paidOutTwd,
      pendingPayoutTwd,
      expectedBalanceTwd,
      actualBalanceTwd,
      diffTwd,
      issues,
      needsAttention: issues.length > 0,
    };
  }).sort((a, b) => Math.abs(b.diffTwd) - Math.abs(a.diffTwd));

  const sum = (field) => guides.reduce((s, g) => s + g[field], 0);

  return {
    guides,
    totals: {
      guideCount: guides.length,
      ledgerNetTwd: sum('ledgerNetTwd'),
      paidOutTwd: sum('paidOutTwd'),
      pendingPayoutTwd: sum('pendingPayoutTwd'),
      expectedBalanceTwd: sum('expectedBalanceTwd'),
      actualBalanceTwd: sum('actualBalanceTwd'),
      absDiffTwd: guides.reduce((s, g) => s + Math.abs(g.diffTwd), 0),
    },
    mismatchCount: guides.filter((g) => g.needsAttention).length,
  };
}

/**
 * 逐訂單比對 ledger 淨額與決策 B 的目標值。
 *
 * @param {{
 *   orders: Array<{id: string, total_twd: number, refund_amount_twd?: number}>,
 *   ledgerRows: Array<{order_id: string, net_twd: number}>,
 *   commissionRate: number,
 * }} input
 */
export function buildOrderReconciliation({ orders = [], ledgerRows = [], commissionRate = 0.15 } = {}) {
  const ledgerByOrder = new Map();
  for (const row of ledgerRows) {
    if (!row?.order_id) continue;
    ledgerByOrder.set(row.order_id, (ledgerByOrder.get(row.order_id) ?? 0) + (Number(row.net_twd) || 0));
  }

  const rows = orders
    // 只檢查已進入 ledger 的訂單——從未結算者由 sweep 的 effective-gmv 處理，
    // 沒有分錄不代表有問題。
    .filter((o) => ledgerByOrder.has(o.id))
    .map((o) => {
      const ledgerNetTwd = ledgerByOrder.get(o.id) ?? 0;
      const targetNetTwd = targetNetPayable(o.total_twd, o.refund_amount_twd ?? 0, commissionRate);
      const diffTwd = ledgerNetTwd - targetNetTwd;
      return {
        orderIdMasked: maskId(o.id),
        totalTwd: Number(o.total_twd) || 0,
        refundAmountTwd: Number(o.refund_amount_twd) || 0,
        ledgerNetTwd,
        targetNetTwd,
        diffTwd,
        needsAttention: diffTwd !== 0,
      };
    })
    .sort((a, b) => Math.abs(b.diffTwd) - Math.abs(a.diffTwd));

  return {
    orders: rows,
    totals: {
      checkedCount: rows.length,
      mismatchCount: rows.filter((r) => r.needsAttention).length,
      absDiffTwd: rows.reduce((s, r) => s + Math.abs(r.diffTwd), 0),
    },
  };
}

/**
 * 資格稽核：找出「已進 ledger 但當初不該被結算」的訂單。
 *
 * 為什麼金額對帳抓不到這種錯（2026-07-29 實例）：
 *   生產上有一筆 `paid_at IS NULL`（平台從未實收）的訂單被結算成 net 6120。
 *   它的金額完全正確——floor(7200 × 0.85) = 6120，ledger 與餘額也一致——
 *   因此逐導遊與逐訂單的金額對帳全部判定「正常」。錯的不是金額，是**資格**。
 *
 * 這一層檢查的正是 fn_record_settlement_atomic 在交易內重驗的那組條件，
 * 差別在於它回頭掃既有分錄，找出修復上線前留下的存量。
 *
 * 註：淨額已被 reversal 沖銷為 0 者不再列為待處理——帳已平，列出來只是雜訊。
 *
 * @param {{ orders: Array<{id: string, status?: string, paid_at?: string|null,
 *   is_disputed?: boolean, is_safety_case?: boolean, has_complaint?: boolean,
 *   has_oversell_issue?: boolean}>,
 *   ledgerRows: Array<{order_id: string, net_twd: number}> }} input
 */
export function buildEligibilityAudit({ orders = [], ledgerRows = [] } = {}) {
  const netByOrder = new Map();
  for (const row of ledgerRows) {
    if (!row?.order_id) continue;
    netByOrder.set(row.order_id, (netByOrder.get(row.order_id) ?? 0) + (Number(row.net_twd) || 0));
  }

  const rows = orders
    .filter((o) => netByOrder.has(o.id))
    .map((o) => {
      const reasons = [];
      if (!o.paid_at) reasons.push('never_collected');
      if (o.status && o.status !== 'completed') reasons.push(`status_${o.status}`);
      if (o.is_disputed) reasons.push('payment_dispute');
      if (o.is_safety_case) reasons.push('safety_review');
      if (o.has_complaint) reasons.push('complaint_under_review');
      if (o.has_oversell_issue) reasons.push('oversell_investigation');

      const ledgerNetTwd = netByOrder.get(o.id) ?? 0;
      return {
        orderIdMasked: maskId(o.id),
        ledgerNetTwd,
        reasons,
        // 淨額已沖銷為 0 = 帳面已平，僅供追溯，不需人工處理
        alreadyReversed: reasons.length > 0 && ledgerNetTwd === 0,
        needsAttention: reasons.length > 0 && ledgerNetTwd !== 0,
      };
    })
    .filter((r) => r.reasons.length > 0)
    .sort((a, b) => Math.abs(b.ledgerNetTwd) - Math.abs(a.ledgerNetTwd));

  return {
    orders: rows,
    totals: {
      flaggedCount: rows.length,
      needsAttentionCount: rows.filter((r) => r.needsAttention).length,
      alreadyReversedCount: rows.filter((r) => r.alreadyReversed).length,
      outstandingTwd: rows.filter((r) => r.needsAttention).reduce((s, r) => s + r.ledgerNetTwd, 0),
    },
  };
}

/**
 * 漏結算稽核：找出「早就該結算、卻連一筆分錄都沒有」的訂單（#1777 F6）。
 *
 * ## 為什麼需要這一支
 *
 * 上面兩支對帳（`buildOrderReconciliation`／`buildEligibilityAudit`）都以
 * `ledgerRows` 為起點過濾（`.filter((o) => ledgerByOrder.has(o.id))`），因此只看得見
 * **已經進了 ledger** 的訂單。它們能回答「入帳的金額對不對」「不該入帳的有沒有入帳」，
 * 但**結構上不可能**回答「該入帳的有沒有漏掉」——沒有分錄的訂單根本進不了迴圈。
 *
 * 這正是 #1777 缺口 3 的失敗模式會留下的痕跡：payout item 寫成功、餘額更新失敗，
 * 重跑時因為「已有 payout item」被跳過；或反過來，sweep 整批失敗（例如 42P10）
 * 導致某幾天完全沒結算。前者靠 `buildGuideReconciliation` 的金額差抓得到，
 * **後者只會表現為「什麼都沒有」——三方金額全都一致，因為三方都是 0。**
 *
 * ## 判定條件
 *
 * 與 sweep（`app/api/internal/settlement/sweep/route.ts`）和
 * `fn_record_settlement_atomic` 的交易內重驗逐條對齊：
 *   - `status === 'completed'`
 *   - `paid_at` 非空（未實收不得結算）
 *   - 四個 hold 旗標皆為 false
 *   - `effective = max(0, total − 累積退款) > 0`
 *   - `eligibleSince`（sweep 用 booking.start_at，fallback activity_schedules.start_at）
 *     早於 `asOf − tDays`
 * 全部成立卻沒有任何 ledger 分錄 → 導遊該拿的錢沒進帳。
 *
 * `asOf` 由呼叫端提供（本模組維持純函式、無 `Date.now()`）；未提供時回
 * `evaluated: false` 並且不下任何結論——**不猜**。
 *
 * @param {{
 *   orders: Array<{id: string, status?: string, paid_at?: string|null,
 *     total_twd?: number, refund_amount_twd?: number, eligible_since?: string|null,
 *     is_disputed?: boolean, is_safety_case?: boolean,
 *     has_complaint?: boolean, has_oversell_issue?: boolean}>,
 *   ledgerRows: Array<{order_id: string}>,
 *   commissionRate?: number,
 *   tDays?: number,
 *   asOf?: string|null,
 * }} input
 */
export function buildMissedSettlementAudit({
  orders = [],
  ledgerRows = [],
  commissionRate = 0.15,
  tDays = 7,
  asOf = null,
} = {}) {
  const asOfMs = asOf ? Date.parse(asOf) : NaN;
  if (!Number.isFinite(asOfMs)) {
    return { evaluated: false, orders: [], totals: { checkedCount: 0, missedCount: 0, missedNetTwd: 0 } };
  }

  const cutoffMs = asOfMs - tDays * 24 * 60 * 60 * 1000;
  const settled = new Set(ledgerRows.map((r) => r?.order_id).filter(Boolean));

  const rows = orders
    // 這裡的過濾方向與其他兩支相反：只看**沒有**分錄的訂單。
    .filter((o) => o?.id && !settled.has(o.id))
    .map((o) => {
      const effectiveTwd = effectiveGmvTwd(o.total_twd, o.refund_amount_twd ?? 0);
      const sinceMs = o.eligible_since ? Date.parse(o.eligible_since) : NaN;

      // 「不該結算」的理由；一條都沒有＝本來就該結算，卻沒有分錄。
      const notDueReasons = [];
      if (o.status !== 'completed') notDueReasons.push(`status_${o.status ?? 'unknown'}`);
      if (!o.paid_at) notDueReasons.push('never_collected');
      if (o.is_disputed) notDueReasons.push('payment_dispute');
      if (o.is_safety_case) notDueReasons.push('safety_review');
      if (o.has_complaint) notDueReasons.push('complaint_under_review');
      if (o.has_oversell_issue) notDueReasons.push('oversell_investigation');
      if (effectiveTwd <= 0) notDueReasons.push('fully_refunded');
      if (sinceMs >= cutoffMs) notDueReasons.push('within_t_plus_n');

      // 「算不出 eligible_since」不是「不該結算」——是**根本無法判斷**。
      // sweep 用的也是同一個欄位（booking.start_at fallback schedule.start_at），
      // 因此這種訂單 sweep 同樣評估不了 ⇒ 永遠不會結算。把它混進 notDueReasons
      // 會讓「無法評估」長得跟「沒事」一樣——那正是 F6 要消滅的那種盲點，只是
      // 換了個小一號的版本。所以獨立成一類。
      const notEvaluable = !Number.isFinite(sinceMs)
        && notDueReasons.length === 0
        && o.status === 'completed'
        && !!o.paid_at
        && effectiveTwd > 0;

      return {
        orderIdMasked: maskId(o.id),
        effectiveTwd,
        expectedNetTwd: computeNetTwd(effectiveTwd, commissionRate),
        notDueReasons,
        notEvaluable,
        // 無法評估者不算「已確認漏結算」，但也絕不算通過。
        needsAttention: notDueReasons.length === 0 && Number.isFinite(sinceMs),
      };
    })
    .filter((r) => r.needsAttention || r.notEvaluable)
    .sort((a, b) => b.expectedNetTwd - a.expectedNetTwd);

  const missed = rows.filter((r) => r.needsAttention);
  const notEvaluable = rows.filter((r) => r.notEvaluable);

  return {
    evaluated: true,
    orders: rows,
    totals: {
      checkedCount: orders.filter((o) => o?.id && !settled.has(o.id)).length,
      missedCount: missed.length,
      missedNetTwd: missed.reduce((s, r) => s + r.expectedNetTwd, 0),
      notEvaluableCount: notEvaluable.length,
      notEvaluableNetTwd: notEvaluable.reduce((s, r) => s + r.expectedNetTwd, 0),
    },
  };
}

/**
 * 彙整成一份可直接呈現的對帳結論。
 *
 * `ok: true` 代表：三方金額一致、每張訂單淨額等於決策 B 目標、沒有不符資格卻仍留有
 * 淨額的分錄，且**沒有該結算卻漏掉的訂單**（#1777 F6）。
 *
 * 最後一項刻意納入 `ok`：漏結算的三方金額全都是 0，因此三方對帳一定「一致」——
 * 不把它算進來，一整批漏結算會呈現為完全正常。
 *
 * `missedSettlementAudit` 未提供或 `evaluated: false`（缺 `asOf`）時，該項不計入
 * `ok`，並以 `missedSettlementEvaluated: false` 誠實標示「這一面向沒被檢查」，
 * 而不是默默當成通過。
 *
 * @param {{guideReconciliation?: any, orderReconciliation?: any,
 *   eligibilityAudit?: any, missedSettlementAudit?: any}} input
 */
export function buildReconciliationReport({
  guideReconciliation,
  orderReconciliation,
  eligibilityAudit,
  missedSettlementAudit = null,
}) {
  const guideMismatch = guideReconciliation?.mismatchCount ?? 0;
  const orderMismatch = orderReconciliation?.totals?.mismatchCount ?? 0;
  const eligibilityIssues = eligibilityAudit?.totals?.needsAttentionCount ?? 0;
  const missedEvaluated = missedSettlementAudit?.evaluated === true;
  const missedCount = missedEvaluated ? (missedSettlementAudit?.totals?.missedCount ?? 0) : 0;
  // 「算不出結算資格時點」的訂單同樣讓 ok 為 false：sweep 對它們也永遠評估不了，
  // 放著就是永遠不會結算。它需要的是資料修復而非補結算，但不能當成通過。
  const notEvaluableCount = missedEvaluated ? (missedSettlementAudit?.totals?.notEvaluableCount ?? 0) : 0;

  return {
    ok: guideMismatch === 0 && orderMismatch === 0 && eligibilityIssues === 0
      && missedCount === 0 && notEvaluableCount === 0,
    guideMismatchCount: guideMismatch,
    orderMismatchCount: orderMismatch,
    eligibilityIssueCount: eligibilityIssues,
    missedSettlementCount: missedCount,
    notEvaluableSettlementCount: notEvaluableCount,
    missedSettlementEvaluated: missedEvaluated,
    guides: guideReconciliation?.guides ?? [],
    guideTotals: guideReconciliation?.totals ?? null,
    orders: orderReconciliation?.orders?.filter((o) => o.needsAttention) ?? [],
    orderTotals: orderReconciliation?.totals ?? null,
    ineligibleSettlements: eligibilityAudit?.orders?.filter((o) => o.needsAttention) ?? [],
    eligibilityTotals: eligibilityAudit?.totals ?? null,
    missedSettlements: missedSettlementAudit?.orders ?? [],
    missedSettlementTotals: missedSettlementAudit?.totals ?? null,
  };
}

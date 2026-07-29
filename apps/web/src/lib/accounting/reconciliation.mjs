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
  const effective = Math.max(0, (Number(totalTwd) || 0) - (Number(refundTwd) || 0));
  return Math.floor(effective * (1 - commissionRate));
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
 * 彙整成一份可直接呈現的對帳結論。
 * `ok: true` 代表 ledger／餘額／出款三者一致，且每張訂單的淨額都等於決策 B 目標。
 */
export function buildReconciliationReport({ guideReconciliation, orderReconciliation }) {
  const guideMismatch = guideReconciliation?.mismatchCount ?? 0;
  const orderMismatch = orderReconciliation?.totals?.mismatchCount ?? 0;
  return {
    ok: guideMismatch === 0 && orderMismatch === 0,
    guideMismatchCount: guideMismatch,
    orderMismatchCount: orderMismatch,
    guides: guideReconciliation?.guides ?? [],
    guideTotals: guideReconciliation?.totals ?? null,
    orders: orderReconciliation?.orders?.filter((o) => o.needsAttention) ?? [],
    orderTotals: orderReconciliation?.totals ?? null,
  };
}

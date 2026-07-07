// @ts-check
/**
 * #1637 每月會計報帳報表 — 純計算層（無 DB / framework 依賴，node --test 可直測）。
 *
 * 歸月原則（Asia/Taipei 月界線，全部轉成 UTC instant 查詢）：
 * - 收款：orders.paid_at（實際收到款的月份）
 * - 退款：payments.refunded_at（實際退出款的月份）
 * - 結算：payout_items.settled_at（分潤入導遊餘額的月份；reversal 紅沖列本身為負值，直接加總）
 * - 出帳：payouts.confirmed_at（state='paid'，實際匯款給導遊的月份）
 * - 負債快照：guide_balances / pending payouts 為「產出當下」即時快照，不歸月。
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TAIPEI_OFFSET_MINUTES = 8 * 60;

/** @param {string} month */
export function isValidReportMonth(month) {
  return typeof month === 'string' && MONTH_RE.test(month);
}

/**
 * 台北時區的月份界線 → UTC instant（半開區間 [startIso, endIso)）。
 * 例：'2026-06' → start 2026-05-31T16:00:00.000Z、end 2026-06-30T16:00:00.000Z。
 * @param {string} month - 'YYYY-MM'
 * @returns {{ startIso: string, endIso: string }}
 */
export function taipeiMonthRangeUtc(month) {
  if (!isValidReportMonth(month)) throw new Error('month must be YYYY-MM');
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monthStr, 10) - 1;
  const startMs = Date.UTC(year, mon, 1) - TAIPEI_OFFSET_MINUTES * 60000;
  const endMs = Date.UTC(year, mon + 1, 1) - TAIPEI_OFFSET_MINUTES * 60000;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

/**
 * UTC ISO → 台北時間 'YYYY-MM-DD HH:mm'（報表顯示用）。
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function formatTaipeiDateTime(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const t = new Date(ms + TAIPEI_OFFSET_MINUTES * 60000);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** @param {unknown} v */
function toInt(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * 組裝月結報表（route 撈完原始列後呼叫；輸入皆為 plain array，缺料給空陣列）。
 * @param {{
 *   month: string,
 *   generatedAt: string,
 *   collections?: Array<{ orderId: string, paidAt: string|null, totalTwd: number, activityTitle?: string|null, guideName?: string|null }>,
 *   refunds?: Array<{ orderId: string, refundedAt: string|null, refundedAmountTwd: number }>,
 *   settlements?: Array<{ orderId: string, guideId?: string|null, guideName?: string|null, settledAt: string|null, gmvTwd: number, commissionTwd: number, netTwd: number, settlementKind?: string|null }>,
 *   payoutsPaid?: Array<{ payoutId: string, guideId?: string|null, guideName?: string|null, confirmedAt: string|null, totalTwd: number, transferRef?: string|null }>,
 *   guideBalances?: Array<{ guideId: string, guideName?: string|null, balanceTwd: number }>,
 *   pendingPayouts?: Array<{ payoutId: string, guideId?: string|null, guideName?: string|null, totalTwd: number, createdAt?: string|null }>,
 *   anomalies?: { paidUnsettledCount?: number, paidUnsettledTwd?: number, completedWithoutPaidAtCount?: number },
 * }} input
 */
export function buildMonthlyAccountingReport(input) {
  const {
    month,
    generatedAt,
    collections = [],
    refunds = [],
    settlements = [],
    payoutsPaid = [],
    guideBalances = [],
    pendingPayouts = [],
    anomalies = {},
  } = input ?? {};
  if (!isValidReportMonth(month)) throw new Error('month must be YYYY-MM');

  const collectedTwd = collections.reduce((s, r) => s + toInt(r.totalTwd), 0);
  const refundedTwd = refunds.reduce((s, r) => s + toInt(r.refundedAmountTwd), 0);

  const settlementRows = settlements.filter((r) => (r.settlementKind ?? 'settlement') !== 'reversal');
  const reversalRows = settlements.filter((r) => (r.settlementKind ?? 'settlement') === 'reversal');
  // reversal 列本身即負值（db.mjs recordRefundReversal），總額直接全列加總
  const settledGmvTwd = settlements.reduce((s, r) => s + toInt(r.gmvTwd), 0);
  const commissionTwd = settlements.reduce((s, r) => s + toInt(r.commissionTwd), 0);
  const settledNetTwd = settlements.reduce((s, r) => s + toInt(r.netTwd), 0);

  const paidOutTwd = payoutsPaid.reduce((s, r) => s + toInt(r.totalTwd), 0);
  const guideBalanceTwd = guideBalances.reduce((s, r) => s + toInt(r.balanceTwd), 0);
  const pendingPayoutTwd = pendingPayouts.reduce((s, r) => s + toInt(r.totalTwd), 0);

  return {
    month,
    generatedAt,
    revenue: {
      collectedTwd,
      collectedCount: collections.length,
      refundedTwd,
      refundedCount: refunds.length,
      netCollectedTwd: collectedTwd - refundedTwd,
    },
    settlement: {
      gmvTwd: settledGmvTwd,
      commissionTwd,
      netTwd: settledNetTwd,
      itemCount: settlementRows.length,
      reversalCount: reversalRows.length,
    },
    payouts: {
      paidTwd: paidOutTwd,
      paidCount: payoutsPaid.length,
    },
    liabilities: {
      guideBalanceTwd,
      pendingPayoutTwd,
      pendingPayoutCount: pendingPayouts.length,
    },
    anomalies: {
      paidUnsettledCount: toInt(anomalies.paidUnsettledCount),
      paidUnsettledTwd: toInt(anomalies.paidUnsettledTwd),
      completedWithoutPaidAtCount: toInt(anomalies.completedWithoutPaidAtCount),
    },
    details: {
      collections,
      refunds,
      settlements,
      payoutsPaid,
      guideBalances,
      pendingPayouts,
    },
  };
}

/** CSV 欄位跳脫：含逗號/引號/換行時加雙引號包裹。 @param {unknown} v */
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** @param {Array<unknown>} cells */
function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

/**
 * 報表 → CSV 字串（UTF-8 BOM 開頭，Excel 直開不亂碼）。
 * 摘要區＋統一明細區（類別/日期(台北)/單號/對象/金額欄）。
 * @param {ReturnType<typeof buildMonthlyAccountingReport>} report
 */
export function renderMonthlyAccountingCsv(report) {
  const lines = [];
  lines.push(csvRow(['祕島 Midao 月結會計報表', report.month]));
  lines.push(csvRow(['產出時間（台北）', formatTaipeiDateTime(report.generatedAt)]));
  lines.push('');
  lines.push(csvRow(['【摘要】項目', '金額(TWD)', '筆數']));
  lines.push(csvRow(['本月實收（訂單收款，依 paid_at 歸月）', report.revenue.collectedTwd, report.revenue.collectedCount]));
  lines.push(csvRow(['本月退款（依 refunded_at 歸月）', -report.revenue.refundedTwd, report.revenue.refundedCount]));
  lines.push(csvRow(['本月淨收款', report.revenue.netCollectedTwd, '']));
  lines.push(csvRow(['本月結算 GMV（依 settled_at 歸月，含紅沖）', report.settlement.gmvTwd, report.settlement.itemCount]));
  lines.push(csvRow(['平台抽成收入', report.settlement.commissionTwd, '']));
  lines.push(csvRow(['導遊分潤（本月新增應付）', report.settlement.netTwd, '']));
  lines.push(csvRow(['紅沖筆數', '', report.settlement.reversalCount]));
  lines.push(csvRow(['本月已出帳（付導遊，依 confirmed_at 歸月）', report.payouts.paidTwd, report.payouts.paidCount]));
  lines.push(csvRow(['期末導遊餘額（未出帳負債，即時快照）', report.liabilities.guideBalanceTwd, '']));
  lines.push(csvRow(['期末待出款單（pending，即時快照）', report.liabilities.pendingPayoutTwd, report.liabilities.pendingPayoutCount]));
  lines.push('');
  lines.push(csvRow(['【對帳異常】項目', '金額(TWD)', '筆數']));
  lines.push(csvRow(['已付款未結算訂單（status=paid，全期累計）', report.anomalies.paidUnsettledTwd, report.anomalies.paidUnsettledCount]));
  lines.push(csvRow(['completed 但無 paid_at（不會被結算）', '', report.anomalies.completedWithoutPaidAtCount]));
  lines.push('');
  lines.push(csvRow(['【明細】類別', '日期（台北）', '單號', '對象', '總額(TWD)', '抽成(TWD)', '導遊淨額(TWD)', '備註']));
  for (const r of report.details.collections) {
    lines.push(csvRow(['收款', formatTaipeiDateTime(r.paidAt), r.orderId, r.activityTitle ?? '', r.totalTwd, '', '', r.guideName ?? '']));
  }
  for (const r of report.details.refunds) {
    lines.push(csvRow(['退款', formatTaipeiDateTime(r.refundedAt), r.orderId, '', -toInt(r.refundedAmountTwd), '', '', '']));
  }
  for (const r of report.details.settlements) {
    lines.push(csvRow([
      (r.settlementKind ?? 'settlement') === 'reversal' ? '結算紅沖' : '結算',
      formatTaipeiDateTime(r.settledAt), r.orderId, r.guideName ?? '', r.gmvTwd, r.commissionTwd, r.netTwd, '',
    ]));
  }
  for (const r of report.details.payoutsPaid) {
    lines.push(csvRow(['出帳', formatTaipeiDateTime(r.confirmedAt), r.payoutId, r.guideName ?? '', r.totalTwd, '', '', r.transferRef ?? '']));
  }
  for (const r of report.details.pendingPayouts) {
    lines.push(csvRow(['待出款（快照）', formatTaipeiDateTime(r.createdAt), r.payoutId, r.guideName ?? '', r.totalTwd, '', '', 'pending']));
  }
  for (const r of report.details.guideBalances) {
    lines.push(csvRow(['導遊餘額（快照）', '', '', r.guideName ?? r.guideId, r.balanceTwd, '', '', '']));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

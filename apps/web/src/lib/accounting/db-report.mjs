/**
 * #1637 每月會計報帳報表 — 資料存取層（strangler：領域檔，不進 db.mjs）。
 * 只讀不寫；歸月界線由 accounting-report.mjs 的 taipeiMonthRangeUtc 決定。
 * 型別中性（Supabase row 無型別；@ts-check 債併入 #1597，同 #1613 決策）。
 */

import { taipeiMonthRangeUtc } from './report.mjs';

/**
 * 撈出組報表所需的全部原始列（Promise.all 平行；名稱 enrich 在本函式內完成）。
 * @param {any} supabase — service-role Supabase client
 * @param {string} month - 'YYYY-MM'
 * @returns {Promise<any>} buildMonthlyAccountingReport 的輸入（不含 month/generatedAt）
 */
export async function getMonthlyAccountingReportDataDb(supabase, month) {
  const { startIso, endIso } = taipeiMonthRangeUtc(month);

  const [
    collectionsRes,
    refundsRes,
    settlementsRes,
    payoutsPaidRes,
    balancesRes,
    pendingPayoutsRes,
    paidUnsettledRes,
    completedNoPaidAtRes,
  ] = await Promise.all([
    // 收款：paid_at 歸月（含後續被退款/完成的訂單——收款事實不因後續狀態消失）
    supabase
      .from('orders')
      .select('id, total_twd, paid_at, activity_id')
      .gte('paid_at', startIso)
      .lt('paid_at', endIso)
      .order('paid_at', { ascending: true })
      .limit(2000),
    // 退款：payments.refunded_at 歸月
    supabase
      .from('payments')
      .select('order_id, refunded_amount_twd, refunded_at')
      .gte('refunded_at', startIso)
      .lt('refunded_at', endIso)
      .gt('refunded_amount_twd', 0)
      .order('refunded_at', { ascending: true })
      .limit(2000),
    // 結算分錄（含紅沖負值列）：settled_at 歸月
    supabase
      .from('payout_items')
      .select('order_id, guide_id, gmv_twd, commission_twd, net_twd, settled_at, settlement_kind')
      .gte('settled_at', startIso)
      .lt('settled_at', endIso)
      .order('settled_at', { ascending: true })
      .limit(2000),
    // 出帳：confirmed_at 歸月、state=paid
    supabase
      .from('payouts')
      .select('id, guide_id, total_twd, confirmed_at, transfer_ref')
      .eq('state', 'paid')
      .gte('confirmed_at', startIso)
      .lt('confirmed_at', endIso)
      .order('confirmed_at', { ascending: true })
      .limit(2000),
    // 期末負債快照（即時）
    supabase
      .from('guide_balances')
      .select('guide_id, balance_twd')
      .gt('balance_twd', 0)
      .limit(2000),
    supabase
      .from('payouts')
      .select('id, guide_id, total_twd, created_at')
      .eq('state', 'pending')
      .limit(2000),
    // 對帳異常：已付款但卡在 paid、從未結算（全期累計，非歸月——提示鏈路卡單）
    supabase
      .from('orders')
      .select('id, total_twd')
      .eq('status', 'paid')
      .limit(2000),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .is('paid_at', null),
  ]);

  const firstError =
    collectionsRes.error || refundsRes.error || settlementsRes.error ||
    payoutsPaidRes.error || balancesRes.error || pendingPayoutsRes.error ||
    paidUnsettledRes.error || completedNoPaidAtRes.error;
  if (firstError) throw new Error(firstError.message || 'accounting report query failed');

  const collectionRows = collectionsRes.data ?? [];
  const settlementRows = settlementsRes.data ?? [];
  const payoutPaidRows = payoutsPaidRes.data ?? [];
  const balanceRows = balancesRes.data ?? [];
  const pendingPayoutRows = pendingPayoutsRes.data ?? [];

  // 名稱 enrich：activities（title＋guide_id）→ guide_profiles（display_name）
  const activityIds = [...new Set(collectionRows.map((r) => r.activity_id).filter(Boolean))];
  const { data: activityRows } = activityIds.length > 0
    ? await supabase.from('activities').select('id, title, guide_id').in('id', activityIds)
    : { data: [] };
  const activityById = new Map((activityRows ?? []).map((a) => [a.id, a]));

  const guideIds = [...new Set([
    ...settlementRows.map((r) => r.guide_id),
    ...payoutPaidRows.map((r) => r.guide_id),
    ...balanceRows.map((r) => r.guide_id),
    ...pendingPayoutRows.map((r) => r.guide_id),
    ...(activityRows ?? []).map((a) => a.guide_id),
  ].filter(Boolean))];
  const { data: profileRows } = guideIds.length > 0
    ? await supabase.from('guide_profiles').select('id, display_name').in('id', guideIds)
    : { data: [] };
  const guideNameById = new Map((profileRows ?? []).map((p) => [p.id, p.display_name ?? null]));

  // 全期已結算 order_id（異常清單要對全期結算判斷，不能只看本月分錄）
  const paidOrders = paidUnsettledRes.data ?? [];
  const paidOrderIds = paidOrders.map((o) => o.id);
  let settledEverIds = new Set();
  if (paidOrderIds.length > 0) {
    const { data: settledRows } = await supabase
      .from('payout_items')
      .select('order_id')
      .eq('settlement_kind', 'settlement')
      .in('order_id', paidOrderIds);
    settledEverIds = new Set((settledRows ?? []).map((r) => r.order_id));
  }
  const paidUnsettled = paidOrders.filter((o) => !settledEverIds.has(o.id));

  return {
    collections: collectionRows.map((r) => {
      const activity = activityById.get(r.activity_id);
      return {
        orderId: r.id,
        paidAt: r.paid_at ?? null,
        totalTwd: Number(r.total_twd ?? 0),
        activityTitle: activity?.title ?? null,
        guideName: activity ? (guideNameById.get(activity.guide_id) ?? null) : null,
      };
    }),
    refunds: (refundsRes.data ?? []).map((r) => ({
      orderId: r.order_id,
      refundedAt: r.refunded_at ?? null,
      refundedAmountTwd: Number(r.refunded_amount_twd ?? 0),
    })),
    settlements: settlementRows.map((r) => ({
      orderId: r.order_id,
      guideId: r.guide_id ?? null,
      guideName: guideNameById.get(r.guide_id) ?? null,
      settledAt: r.settled_at ?? null,
      gmvTwd: Number(r.gmv_twd ?? 0),
      commissionTwd: Number(r.commission_twd ?? 0),
      netTwd: Number(r.net_twd ?? 0),
      settlementKind: r.settlement_kind ?? 'settlement',
    })),
    payoutsPaid: payoutPaidRows.map((r) => ({
      payoutId: r.id,
      guideId: r.guide_id ?? null,
      guideName: guideNameById.get(r.guide_id) ?? null,
      confirmedAt: r.confirmed_at ?? null,
      totalTwd: Number(r.total_twd ?? 0),
      transferRef: r.transfer_ref ?? null,
    })),
    guideBalances: balanceRows.map((r) => ({
      guideId: r.guide_id,
      guideName: guideNameById.get(r.guide_id) ?? null,
      balanceTwd: Number(r.balance_twd ?? 0),
    })),
    pendingPayouts: pendingPayoutRows.map((r) => ({
      payoutId: r.id,
      guideId: r.guide_id ?? null,
      guideName: guideNameById.get(r.guide_id) ?? null,
      totalTwd: Number(r.total_twd ?? 0),
      createdAt: r.created_at ?? null,
    })),
    anomalies: {
      paidUnsettledCount: paidUnsettled.length,
      paidUnsettledTwd: paidUnsettled.reduce((s, o) => s + Number(o.total_twd ?? 0), 0),
      completedWithoutPaidAtCount: completedNoPaidAtRes.count ?? 0,
    },
  };
}

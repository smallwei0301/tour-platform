/**
 * #1777 Phase 4 — 對帳資料存取層（strangler：領域檔，不進 db.mjs）。
 *
 * **只讀。** 本模組不含任何寫入路徑——對帳的用途是找出不一致並交給人工判斷，
 * 修復動作一律另案取得 owner 授權後執行（#1777 授權邊界）。
 */

/**
 * 撈出對帳所需的原始列並組成純函式的輸入。
 *
 * @param {any} supabase service-role Supabase client
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{
 *   ledgerRows: Array<{order_id: string, guide_id: string, net_twd: number}>,
 *   balanceRows: Array<{guide_id: string, balance_twd: number}>,
 *   paidPayouts: Array<{guide_id: string, total_twd: number}>,
 *   pendingPayouts: Array<{guide_id: string, total_twd: number}>,
 *   orders: Array<{id: string, total_twd: number, refund_amount_twd: number}>,
 *   commissionRate: number,
 * }>}
 */
export async function getReconciliationDataDb(supabase, { limit = 5000 } = {}) {
  const [ledgerRes, balanceRes, payoutRes, rulesRes] = await Promise.all([
    supabase
      .from('payout_items')
      .select('order_id, guide_id, net_twd, settlement_kind')
      .limit(limit),
    supabase
      .from('guide_balances')
      .select('guide_id, balance_twd')
      .limit(limit),
    supabase
      .from('payouts')
      .select('guide_id, total_twd, state')
      .in('state', ['paid', 'pending'])
      .limit(limit),
    supabase
      .from('settlement_rules')
      .select('commission_rate')
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  const firstError = ledgerRes.error || balanceRes.error || payoutRes.error;
  if (firstError) throw new Error(firstError.message || 'reconciliation query failed');

  const ledgerRows = (ledgerRes.data ?? []).map((r) => ({
    order_id: r.order_id,
    guide_id: r.guide_id,
    net_twd: Number(r.net_twd ?? 0),
  }));

  const payoutRows = payoutRes.data ?? [];

  // 只取有 ledger 分錄的訂單——沒有分錄者不在對帳範圍（由 sweep 的
  // effective-gmv 直接處理，缺分錄不代表異常）。
  const orderIds = [...new Set(ledgerRows.map((r) => r.order_id).filter(Boolean))];
  let orders = [];
  if (orderIds.length > 0) {
    // status／paid_at／四個 hold 旗標供資格稽核使用——金額對帳抓不到「金額算對
    // 但當初根本不該結算」的分錄（#1777 Phase 4）。
    const [orderRes, opsRes] = await Promise.all([
      supabase.from('orders').select('id, total_twd, status, paid_at').in('id', orderIds),
      supabase
        .from('operations_tracking')
        .select('order_id, refund_amount_twd, is_disputed, is_safety_case, has_complaint, has_oversell_issue')
        .in('order_id', orderIds),
    ]);
    if (orderRes.error) throw new Error(orderRes.error.message);

    const opsByOrder = new Map((opsRes.data ?? []).map((r) => [r.order_id, r]));
    orders = (orderRes.data ?? []).map((o) => {
      const ops = opsByOrder.get(o.id);
      return {
        id: o.id,
        total_twd: Number(o.total_twd ?? 0),
        status: o.status ?? null,
        paid_at: o.paid_at ?? null,
        refund_amount_twd: Number(ops?.refund_amount_twd ?? 0),
        is_disputed: ops?.is_disputed === true,
        is_safety_case: ops?.is_safety_case === true,
        has_complaint: ops?.has_complaint === true,
        has_oversell_issue: ops?.has_oversell_issue === true,
      };
    });
  }

  return {
    ledgerRows,
    balanceRows: (balanceRes.data ?? []).map((r) => ({
      guide_id: r.guide_id,
      balance_twd: Number(r.balance_twd ?? 0),
    })),
    paidPayouts: payoutRows
      .filter((r) => r.state === 'paid')
      .map((r) => ({ guide_id: r.guide_id, total_twd: Number(r.total_twd ?? 0) })),
    pendingPayouts: payoutRows
      .filter((r) => r.state === 'pending')
      .map((r) => ({ guide_id: r.guide_id, total_twd: Number(r.total_twd ?? 0) })),
    orders,
    commissionRate: Number(rulesRes?.data?.commission_rate ?? 0.15),
  };
}

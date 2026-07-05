/**
 * 結算規則／待結算訂單／營運追蹤（Issue #446 起家）
 * #1613 db.mjs strangler：整塊自 db.mjs 純搬移（行為零變更；型別債見 #1597）。
 * db.mjs 以 re-export 保持既有 caller 匯入路徑不變。
 */
import { listOperationsTrackingFallback, operationsTrackingCsvFallback, operationsTrackingSummaryFallback, updateOperationsTrackingFallback } from './admin.mjs';
import { getKpiConfigDb } from './db-kpi.mjs';
import { getSupabase, hasSupabaseEnv } from './supabase-env.mjs';

// ── Settlement Rules (Issue #446) ──────────────────────────────────────────────

export async function getSettlementRulesDb(supabase) {
  const { data, error } = await supabase
    .from('settlement_rules')
    .select('*')
    .eq('is_active', true)
    .single()
  if (error) return null
  return data
}

export async function updateSettlementRulesDb(supabase, patch, createdBy) {
  // Capture current active row id for rollback
  const { data: oldRows } = await supabase
    .from('settlement_rules')
    .select('id')
    .eq('is_active', true)

  // Deactivate current active row
  await supabase.from('settlement_rules').update({ is_active: false }).eq('is_active', true)

  // Insert new active row (versioned history preserved)
  const { data, error } = await supabase
    .from('settlement_rules')
    .insert({ ...patch, is_active: true, created_by: createdBy })
    .select()
    .single()

  if (error) {
    // Rollback: re-activate the old row so system never has zero active rows
    if (oldRows && oldRows.length > 0) {
      await supabase.from('settlement_rules').update({ is_active: true }).eq('id', oldRows[0].id)
    }
    throw error
  }

  return data
}

// ── Settlement Write-Side (Issue #447) ─────────────────────────────────────────

/**
 * Fetch orders eligible for settlement:
 * - status IN ('paid', 'confirmed', 'completed')
 * - activity schedule start_at <= now() - t_days (cutoff)
 * - not yet present in payout_items
 *
 * @param {object} supabase - service-role Supabase client
 * @param {number} tDays - T+N days holdback period (from settlement_rules)
 * @returns {Promise<Array>} orders with nested activities and activity_schedules
 */
export async function getUnsettledOrdersDb(supabase, tDays) {
  // Issue #847: only `completed` orders enter payout (per
  // docs/05-business/06-payment-plan/03-settlement-rules.md §5). Orders in
  // `paid`/`confirmed` are pre-completion; `refund_pending`/`refunded` are
  // excluded by definition.
  const cutoff = new Date(Date.now() - tDays * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('orders')
    .select('id, total_twd, activity_id, schedule_id, activities!inner(guide_id), activity_schedules!inner(start_at), operations_tracking(refund_amount_twd)')
    .eq('status', 'completed')
    .lte('activity_schedules.start_at', cutoff)
    .not('id', 'in', supabase.from('payout_items').select('order_id'))
  if (error) throw error
  return data ?? []
}

/**
 * Atomically record settlement:
 * 1. Insert payout_items rows (idempotent: ON CONFLICT DO NOTHING via UNIQUE order_id)
 * 2. Upsert guide_balances (fetch existing + accumulate new net_twd)
 *
 * @param {object} supabase - service-role Supabase client
 * @param {Array<{order_id, guide_id, gmv_twd, commission_twd, net_twd, rules_version, settled_at}>} items
 */
export async function recordSettlementDb(supabase, items) {
  if (!items || items.length === 0) return

  // 1. Upsert payout_items — ON CONFLICT DO NOTHING。onConflict 對齊 #449 後的
  // UNIQUE INDEX (order_id, settlement_kind)（舊單欄 UNIQUE(order_id) 已 DROP）；未帶者預設 settlement。
  const { error: piError } = await supabase
    .from('payout_items')
    .upsert(items.map((it) => ({ settlement_kind: 'settlement', ...it })), { onConflict: 'order_id,settlement_kind', ignoreDuplicates: true })
  if (piError) throw piError

  // 2. Accumulate net_twd per guide
  const balanceDeltas = {}
  for (const item of items) {
    balanceDeltas[item.guide_id] = (balanceDeltas[item.guide_id] ?? 0) + item.net_twd
  }

  const now = new Date().toISOString()
  for (const [guide_id, delta] of Object.entries(balanceDeltas)) {
    // Fetch existing balance first so we can accumulate (upsert replaces, not adds)
    const { data: existing } = await supabase
      .from('guide_balances')
      .select('balance_twd')
      .eq('guide_id', guide_id)
      .single()

    const newBalance = (existing?.balance_twd ?? 0) + delta
    const { error: balError } = await supabase
      .from('guide_balances')
      .upsert(
        { guide_id, balance_twd: newBalance, last_settled_at: now, updated_at: now },
        { onConflict: 'guide_id' }
      )
    if (balError) throw balError
  }
}

// ── 營運追蹤（Operations Tracking）────────────────────────────────────────────

export async function listOperationsTrackingDb() {
  if (!hasSupabaseEnv()) return listOperationsTrackingFallback();

  const supabase = await getSupabase();
  const { data: rows, error } = await supabase
    .from('operations_tracking')
    .select('id, order_id, manual_minutes, manual_cost_twd, refund_amount_twd, subsidy_twd, is_rescheduled, has_complaint, has_guide_adjustment, has_oversell_issue, is_disputed, is_safety_case, note, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  // listAdminOrdersDb 仍屬 db.mjs 的 admin-orders 領域；用呼叫時動態 import 取用，
  // 避免 db.mjs（re-export 本檔）⇄ 本檔 的靜態循環（#1613 零循環原則）。
  const { listAdminOrdersDb } = await import('./db.mjs');
  const orderRows = await listAdminOrdersDb({});
  const orderMap = new Map(orderRows.map((o) => [o.id, o]));
  const cfg = await getKpiConfigDb();

  const calc = (o, ops) => {
    const gmv = Number(o?.totalTwd || 0);
    const refundAmountTwd = Number(ops.refund_amount_twd || 0);
    // 有效 GMV：扣除退款後的實收金額
    const effectiveGmv = Math.max(0, gmv - refundAmountTwd);
    // 平台抽成只對有效 GMV 計算
    const commissionTwd = Math.round(effectiveGmv * cfg.commissionRate);
    // 金流費以原始 GMV 計算（通常不退）
    const paymentFeeTwd = Math.round(gmv * cfg.paymentFeeRate);
    const manualCostTwd = Number(ops.manual_cost_twd || 0);
    const subsidyTwd = Number(ops.subsidy_twd || 0);
    const finalContributionTwd = commissionTwd - paymentFeeTwd - manualCostTwd - subsidyTwd;
    const hasException = Boolean(refundAmountTwd > 0 || ops.is_rescheduled || ops.has_complaint || ops.has_guide_adjustment || ops.has_oversell_issue || ops.is_disputed || ops.is_safety_case);
    const isHealthyOrder = cfg.healthyAllowException
      ? finalContributionTwd >= Number(cfg.healthyMinContributionTwd || 0)
      : finalContributionTwd >= Number(cfg.healthyMinContributionTwd || 0) && !hasException;
    return { gmv, effectiveGmv, commissionTwd, paymentFeeTwd, finalContributionTwd, hasException, isHealthyOrder };
  };

  return (rows || []).map((r) => {
    const order = orderMap.get(r.order_id) || {};
    return {
      orderId: r.order_id,
      orderDate: order.createdAt || null,
      guideName: order.experienceSlug || null,
      activityName: order.title || null,
      scheduleDate: order.scheduleStartAt || null,
      travelers: order.peopleCount || 1,
      status: order.status || null,
      manualMinutes: r.manual_minutes || 0,
      manualCostTwd: r.manual_cost_twd || 0,
      refundAmountTwd: r.refund_amount_twd || 0,
      subsidyTwd: r.subsidy_twd || 0,
      isRescheduled: !!r.is_rescheduled,
      hasComplaint: !!r.has_complaint,
      hasGuideAdjustment: !!r.has_guide_adjustment,
      hasOversellIssue: !!r.has_oversell_issue,
      isDisputed: !!r.is_disputed,
      isSafetyCase: !!r.is_safety_case,
      note: r.note || null,
      updatedAt: r.updated_at,
      ...calc(order, r)
    };
  });
}

export async function updateOperationsTrackingDb(input = {}) {
  if (!hasSupabaseEnv()) return updateOperationsTrackingFallback(input);

  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  const supabase = await getSupabase();

  const { data: existing } = await supabase
    .from('operations_tracking')
    .select('id')
    .eq('order_id', orderId)
    .limit(1);

  const payload = {
    manual_minutes: input?.manualMinutes == null ? 0 : Number(input.manualMinutes),
    manual_cost_twd: input?.manualCostTwd == null ? 0 : Number(input.manualCostTwd),
    refund_amount_twd: input?.refundAmountTwd == null ? 0 : Number(input.refundAmountTwd),
    subsidy_twd: input?.subsidyTwd == null ? 0 : Number(input.subsidyTwd),
    is_rescheduled: !!input?.isRescheduled,
    has_complaint: !!input?.hasComplaint,
    has_guide_adjustment: !!input?.hasGuideAdjustment,
    has_oversell_issue: !!input?.hasOversellIssue,
    is_disputed: !!input?.isDisputed,
    is_safety_case: !!input?.isSafetyCase,
    note: input?.note ? String(input.note) : null,
    updated_at: new Date().toISOString()
  };

  if (existing && existing.length > 0) {
    const { error } = await supabase.from('operations_tracking').update(payload).eq('order_id', orderId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('operations_tracking').insert({ id: crypto.randomUUID(), order_id: orderId, ...payload });
    if (error) throw new Error(error.message);
  }

  return (await listOperationsTrackingDb()).find((r) => r.orderId === orderId) || null;
}

export async function operationsTrackingSummaryDb() {
  if (!hasSupabaseEnv()) return operationsTrackingSummaryFallback();
  const [rows, cfg] = await Promise.all([listOperationsTrackingDb(), getKpiConfigDb()]);
  const n = rows.length || 1;
  const sum = (k) => rows.reduce((acc, r) => acc + Number(r[k] || 0), 0);
  return {
    totalOrders: rows.length,
    totalGmv: sum('gmv'),
    totalCommissionTwd: sum('commissionTwd'),
    avgCommissionTwd: Math.round(sum('commissionTwd') / n),
    avgManualMinutes: Number((sum('manualMinutes') / n).toFixed(1)),
    avgManualCostTwd: Math.round(sum('manualCostTwd') / n),
    refundRate: Number(((rows.filter((r) => r.refundAmountTwd > 0).length / n) * 100).toFixed(1)),
    exceptionRate: Number(((rows.filter((r) => r.hasException).length / n) * 100).toFixed(1)),
    avgFinalContributionTwd: Math.round(sum('finalContributionTwd') / n),
    healthyOrderRate: Number(((rows.filter((r) => r.isHealthyOrder).length / n) * 100).toFixed(1)),
    kpiConfig: cfg
  };
}

export async function operationsTrackingCsvDb() {
  if (!hasSupabaseEnv()) return operationsTrackingCsvFallback();
  const rows = await listOperationsTrackingDb();
  const header = [
    'orderId','orderDate','guideName','activityName','scheduleDate','travelers','status','gmv','commissionTwd','paymentFeeTwd','manualMinutes','manualCostTwd','refundAmountTwd','subsidyTwd','hasException','finalContributionTwd','isHealthyOrder','note'
  ];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n');
}


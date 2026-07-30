/**
 * POST /api/internal/settlement/sweep
 * Issue #447 — Tour Platform (Leaf B of #310)
 *
 * Internal cron sweep: settles eligible orders (status = 'completed' only,
 * start_at <= now() - T days, no pending refund) into payout_items and
 * accumulates guide_balances.
 *
 * Eligibility & math policy: docs/05-business/06-payment-plan/03-settlement-rules.md
 * (拍板 by Wei, 2026-05). Updated for #847 — eligibility narrowed from
 * paid/confirmed/completed to completed-only, payout math uses effective amount
 * (total_twd - operations_tracking.refund_amount_twd) so partial refunds reduce
 * the guide payout and fully refunded orders are skipped entirely.
 *
 * Authentication: `x-internal-token` header must match INTERNAL_ALERT_TOKEN env var.
 * Returns 401 when the header is absent or mismatched.
 *
 * Writes（#1777 Phase 2）：ledger 分錄與導遊餘額由 fn_record_settlement_atomic
 * 在單一 DB 交易內完成，本 route 不再直接寫 payout_items／guide_balances，也不做
 * read-modify-write。冪等由 RPC 內的 UNIQUE(order_id, settlement_kind) ＋
 * ON CONFLICT DO NOTHING 保證：只有真正插入新分錄時才動餘額，重跑不重複累加。
 *
 * Risk: HIGH (auth, db-write, financial, cron-safety)
 */
import { NextRequest, NextResponse } from 'next/server';
import { computeSweepPayoutItem, getSettlementConfig } from '../../../../../src/lib/settlement-config';
import { isOrderEligibleForSettlement, pickEffectiveStartAt } from '../../../../../src/lib/internal-sweep-time-source';
import { isSettlementPaymentCollected } from '../../../../../src/lib/post-trip/payout-eligibility.mjs';
import { isCronJobEnabled, recordCronRun } from '../../../../../src/lib/cron-job-controls.mjs';
import { recordSettlementAtomicDb } from '../../../../../src/lib/settlement/db-settlement-atomic.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

// ── Auth guard ─────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('x-internal-token');
  const expected = process.env.INTERNAL_ALERT_TOKEN;
  if (!token || !expected) return false;
  return token === expected;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth guard — x-internal-token must match INTERNAL_ALERT_TOKEN
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Admin kill-switch (#go-no-go) — no-op when the job is disabled in back office
  const cronGate = await isCronJobEnabled('settlement_sweep');
  if (!cronGate.enabled) {
    void recordCronRun({ jobKey: 'settlement_sweep', outcome: 'skipped_by_admin' });
    return NextResponse.json({ ok: true, skipped_by_admin: true });
  }
  const cronStartedAt = new Date().toISOString();

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!
    );

    // Read active settlement config from DB (falls back to env constants)
    const config = await getSettlementConfig(supabase);
    const cutoffDate = new Date(Date.now() - config.t_days * 24 * 60 * 60 * 1000);

    // Pre-fetch the set of already-settled order_ids. PostgREST does NOT support
    // SQL subqueries inside in()/not.in() — passing a raw subquery string as a
    // value makes it try to cast that literal text to uuid and 500s the whole
    // sweep. Read the order_ids as a real query and filter in JS instead.
    // Idempotency is still guaranteed by the upsert below
    // (onConflict: 'order_id,settlement_kind', ignoreDuplicates: true) — this filter
    // is just an optimization to avoid recomputing rows that are already settled.
    const { data: settledRows, error: settledError } = await supabase
      .from('payout_items')
      .select('order_id');

    if (settledError) {
      void recordCronRun({ jobKey: 'settlement_sweep', outcome: 'error', summary: { error: settledError.message.slice(0, 200) }, startedAt: cronStartedAt });
      return NextResponse.json({ ok: false, error: settledError.message }, { status: 500 });
    }

    const settledOrderIds = new Set((settledRows ?? []).map((row) => row.order_id));

    // Fetch candidate orders (Issue #847 policy):
    // - status = 'completed' only (refund_pending / refunded are out by definition)
    // - use booking.start_at as canonical cutoff for V2-linked rows,
    //   and fallback to activity_schedules.start_at for legacy rows
    // - join operations_tracking.refund_amount_twd for effective-amount math,
    //   plus the four #1221 payout-hold flags so computeSweepPayoutItem's gate
    //   can actually fire (#1106: completed orders with an open complaint /
    //   oversell investigation must NOT be auto-settled).
    // - #1777 缺口 1：is_disputed / is_safety_case 自 migration
    //   20260618_operations_tracking_dispute_safety_flags 起就是實體欄位，但一直
    //   沒被投影——PostgREST 只回傳被 select 的欄位，這兩欄以 undefined 抵達
    //   isPayoutOnHold 的 `=== true` 檢查，付款爭議／安全案件的 hold 從未觸發，
    //   而導遊端 computeGuidePayoutEstimate 讀滿四旗標卻顯示 hold（跨介面分裂）。
    //   四旗標必須與導遊端投影完全一致，否則錢會在爭議未決時被撥出去。
    // - bookings 嵌入必須指名 fk_bookings_order_id：#1560 後 orders↔bookings 有兩條
    //   FK，未指名時 PostgREST 回 PGRST201 歧義 → 整個 sweep 500（同 #1554 修法）。
    const { data: completedOrders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        booking_id,
        total_twd,
        paid_at,
        activities!inner(guide_id),
        bookings!fk_bookings_order_id(start_at, end_at, activity_plan_id, activity_id, guide_id),
        activity_schedules(start_at),
        operations_tracking(refund_amount_twd, has_complaint, has_oversell_issue, is_disputed, is_safety_case)
      `)
      .eq('status', 'completed');

    if (ordersError) {
      void recordCronRun({ jobKey: 'settlement_sweep', outcome: 'error', summary: { error: ordersError.message.slice(0, 200) }, startedAt: cronStartedAt });
      return NextResponse.json({ ok: false, error: ordersError.message }, { status: 500 });
    }

    // Drop orders already present in payout_items (the JS-side equivalent of the
    // unsupported NOT IN subquery).
    const orders = (completedOrders ?? []).filter((order) => !settledOrderIds.has(order.id));

    if (orders.length === 0) {
      void recordCronRun({ jobKey: 'settlement_sweep', outcome: 'success', summary: { settled: 0 }, startedAt: cronStartedAt });
      return NextResponse.json({ ok: true, settled: 0, message: 'no orders to settle' });
    }

    const now = new Date().toISOString();
    const settlementSourcePolicy = 'booking_v2_then_legacy_fallback';

    // 四個 hold 旗標必須與上方 select 投影、以及導遊端 computeGuidePayoutEstimate
    // 讀取的欄位保持一致（#1777）。少一個都會讓對應的 hold 悄悄失效。
    type OpsTrackingRow = {
      refund_amount_twd?: number | null;
      has_complaint?: boolean | null;
      has_oversell_issue?: boolean | null;
      is_disputed?: boolean | null;
      is_safety_case?: boolean | null;
    };

    type Order = {
      id: string;
      booking_id?: string | null;
      total_twd: number;
      paid_at?: string | null;
      activities: { guide_id: string } | { guide_id: string }[];
      bookings?: { start_at?: string | null } | { start_at?: string | null }[] | null;
      activity_schedules?: { start_at: string } | { start_at: string }[] | null;
      operations_tracking?: OpsTrackingRow | OpsTrackingRow[] | null;
    };

    const eligibleOrders = (orders as Order[]).filter((order) => {
      // Payment-collected gate (owner 2026-06-22): never settle an order that has
      // not actually collected money. status='completed' alone is insufficient —
      // a completed order with paid_at IS NULL was never paid and must be skipped.
      if (!isSettlementPaymentCollected(order.paid_at ?? null)) return false;
      const booking = Array.isArray(order.bookings) ? order.bookings[0] : order.bookings;
      const schedule = Array.isArray(order.activity_schedules)
        ? order.activity_schedules[0]
        : order.activity_schedules;
      const effectiveStartAt = pickEffectiveStartAt(booking?.start_at ?? null, schedule?.start_at ?? null);
      return isOrderEligibleForSettlement(effectiveStartAt, cutoffDate.toISOString());
    });

    if (eligibleOrders.length === 0) {
      void recordCronRun({ jobKey: 'settlement_sweep', outcome: 'success', summary: { settled: 0 }, startedAt: cronStartedAt });
      return NextResponse.json({ ok: true, settled: 0, message: 'no orders to settle' });
    }

    // Compute payout items via shared helper. Returns null for fully-refunded
    // orders (effective_gmv <= 0) per docs §5; those rows are skipped entirely.
    const payoutItems = eligibleOrders.flatMap((order) => {
      const guide_id = Array.isArray(order.activities)
        ? order.activities[0].guide_id
        : order.activities.guide_id;
      const opsTracking = Array.isArray(order.operations_tracking)
        ? order.operations_tracking[0]
        : order.operations_tracking;
      const item = computeSweepPayoutItem(
        { id: order.id, total_twd: order.total_twd, guide_id },
        opsTracking ?? null,
        { commission_rate: config.commission_rate, version: config.version ?? 'v1' },
      );
      // 顯式帶 settlement_kind='settlement'：#449 後 payout_items 的冪等鍵是
      // UNIQUE(order_id, settlement_kind)，正結算列與紅沖列（settlement_kind='reversal'）
      // 靠這欄區分。不帶則無法正確走複合鍵 index inference。
      return item ? [{ ...item, settled_at: now, settlement_kind: 'settlement' }] : [];
    });

    if (payoutItems.length === 0) {
      void recordCronRun({ jobKey: 'settlement_sweep', outcome: 'success', summary: { settled: 0 }, startedAt: cronStartedAt });
      return NextResponse.json({ ok: true, settled: 0, message: 'no orders to settle' });
    }

    // #1777 Phase 2：ledger 分錄與導遊餘額改由單一 DB 交易完成
    // （fn_record_settlement_atomic）。舊路徑先 upsert payout_items、再由此處
    // 讀出 guide_balances 加 delta 後整列寫回——payout item 成功而 balance 失敗
    // 時，重跑會因上方「已有 payout item 就排除」而永久跳過該訂單，餘額永久
    // 漏加；整列回寫在 sweep × 紅沖 × confirm 併發下也必然 lost update。
    //
    // RPC 內會在交易中重驗資格（completed／已實收／四個 hold 旗標／未全額退款），
    // 因此本次讀取與寫入之間才被標記爭議的訂單會落在 rejected 而非入帳。
    //
    // fail-closed：RPC 未部署（migration 尚未套用）時直接失敗並記錄，**不**退回
    // 舊的非原子路徑——寧可停擺也不要重複扣款或漏加餘額。
    let settlementResult;
    try {
      settlementResult = await recordSettlementAtomicDb(supabase, payoutItems, now);
    } catch (settlementErr) {
      const message = settlementErr instanceof Error ? settlementErr.message : 'settlement failed';
      void recordCronRun({
        jobKey: 'settlement_sweep',
        outcome: 'error',
        summary: { error: message.slice(0, 200) },
        startedAt: cronStartedAt,
      });
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }

    void recordCronRun({
      jobKey: 'settlement_sweep',
      outcome: 'success',
      summary: {
        settled: settlementResult.settled_count,
        guides_updated: settlementResult.guides_updated,
        skipped_existing: settlementResult.skipped_existing,
        rejected_ineligible: settlementResult.rejected_ineligible,
      },
      startedAt: cronStartedAt,
    });
    return NextResponse.json({
      ok: true,
      settled: settlementResult.settled_count,
      guides_updated: settlementResult.guides_updated,
      skipped_existing: settlementResult.skipped_existing,
      rejected_ineligible: settlementResult.rejected_ineligible,
      settlement_source: 'atomic_rpc',
      time_source_policy: settlementSourcePolicy,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    void recordCronRun({ jobKey: 'settlement_sweep', outcome: 'error', summary: { error: message.slice(0, 200) }, startedAt: cronStartedAt });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

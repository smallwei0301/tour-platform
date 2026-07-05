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
 * Idempotency: UNIQUE(order_id) on payout_items + ON CONFLICT DO NOTHING
 *
 * Risk: HIGH (auth, db-write, financial, cron-safety)
 */
import { NextRequest, NextResponse } from 'next/server';
import { computeSweepPayoutItem, getSettlementConfig } from '../../../../../src/lib/settlement-config';
import { isOrderEligibleForSettlement, pickEffectiveStartAt } from '../../../../../src/lib/internal-sweep-time-source';
import { isSettlementPaymentCollected } from '../../../../../src/lib/post-trip/payout-eligibility.mjs';
import { isCronJobEnabled, recordCronRun } from '../../../../../src/lib/cron-job-controls.mjs';

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
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
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
    //   plus has_complaint / has_oversell_issue so computeSweepPayoutItem's
    //   #1221 payout-hold gate can actually fire (#1106: completed orders with
    //   an open complaint / oversell investigation must NOT be auto-settled).
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
        operations_tracking(refund_amount_twd, has_complaint, has_oversell_issue)
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

    type Order = {
      id: string;
      booking_id?: string | null;
      total_twd: number;
      paid_at?: string | null;
      activities: { guide_id: string } | { guide_id: string }[];
      bookings?: { start_at?: string | null } | { start_at?: string | null }[] | null;
      activity_schedules?: { start_at: string } | { start_at: string }[] | null;
      operations_tracking?:
        | { refund_amount_twd?: number | null; has_complaint?: boolean | null; has_oversell_issue?: boolean | null }
        | { refund_amount_twd?: number | null; has_complaint?: boolean | null; has_oversell_issue?: boolean | null }[]
        | null;
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

    // Upsert payout_items — ON CONFLICT DO NOTHING（冪等）。
    // onConflict 必須對齊 #449 後的 UNIQUE INDEX (order_id, settlement_kind)：
    // 舊的單欄 UNIQUE(order_id) 已被 20260513_issue449 migration DROP，若沿用單欄
    // 冪等鍵會讓 Postgres 回「no unique or exclusion constraint matching the
    // ON CONFLICT specification」→ sweep 500（#1365 排上 cron 後首次暴露）。
    // Supabase upsert with ignoreDuplicates=true maps to ON CONFLICT DO NOTHING in PostgREST
    const { error: insertError } = await supabase
      .from('payout_items')
      .upsert(payoutItems, { onConflict: 'order_id,settlement_kind', ignoreDuplicates: true });

    if (insertError) {
      void recordCronRun({ jobKey: 'settlement_sweep', outcome: 'error', summary: { error: insertError.message.slice(0, 200) }, startedAt: cronStartedAt });
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    // Accumulate guide_balances: fetch existing → add delta → upsert new total
    const balanceDeltas: Record<string, number> = {};
    for (const item of payoutItems) {
      balanceDeltas[item.guide_id] = (balanceDeltas[item.guide_id] ?? 0) + item.net_twd;
    }

    for (const [guide_id, delta] of Object.entries(balanceDeltas)) {
      const { data: existing } = await supabase
        .from('guide_balances')
        .select('balance_twd')
        .eq('guide_id', guide_id)
        .single();

      const newBalance = (existing?.balance_twd ?? 0) + delta;
      const { error: balError } = await supabase
        .from('guide_balances')
        .upsert(
          { guide_id, balance_twd: newBalance, last_settled_at: now, updated_at: now },
          { onConflict: 'guide_id' }
        );

      if (balError) {
        void recordCronRun({ jobKey: 'settlement_sweep', outcome: 'error', summary: { error: balError.message.slice(0, 200) }, startedAt: cronStartedAt });
        return NextResponse.json({ ok: false, error: balError.message }, { status: 500 });
      }
    }

    void recordCronRun({
      jobKey: 'settlement_sweep',
      outcome: 'success',
      summary: { settled: payoutItems.length, guides_updated: Object.keys(balanceDeltas).length },
      startedAt: cronStartedAt,
    });
    return NextResponse.json({
      ok: true,
      settled: payoutItems.length,
      guides_updated: Object.keys(balanceDeltas).length,
      settlement_source: 'legacy_fallback',
      time_source_policy: settlementSourcePolicy,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    void recordCronRun({ jobKey: 'settlement_sweep', outcome: 'error', summary: { error: message.slice(0, 200) }, startedAt: cronStartedAt });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

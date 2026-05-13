/**
 * POST /api/internal/settlement/sweep
 * Issue #447 — Tour Platform (Leaf B of #310)
 *
 * Internal cron sweep: settles eligible orders (paid/confirmed/completed, start_at <= now()-T)
 * into payout_items and accumulates guide_balances.
 *
 * Authentication: `x-internal-token` header must match INTERNAL_ALERT_TOKEN env var.
 * Returns 401 when the header is absent or mismatched.
 *
 * Idempotency: UNIQUE(order_id) on payout_items + ON CONFLICT DO NOTHING
 *
 * Settlement math: net = floor(total_twd * (1 - commission_rate))
 * Commission: floor(total_twd * commission_rate)
 *
 * Risk: HIGH (auth, db-write, financial, cron-safety)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSettlementConfig } from '../../../../../src/lib/settlement-config';

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

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Read active settlement config from DB (falls back to env constants)
    const config = await getSettlementConfig(supabase);
    const cutoffDate = new Date(Date.now() - config.t_days * 24 * 60 * 60 * 1000);

    // Fetch unsettled orders:
    // - status IN ('paid', 'confirmed', 'completed')
    // - activity schedule start_at <= cutoff (tour has ended)
    // - not yet present in payout_items
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        total_twd,
        activities!inner(guide_id),
        activity_schedules!inner(start_at)
      `)
      .in('status', ['paid', 'confirmed', 'completed'])
      .lte('activity_schedules.start_at', cutoffDate.toISOString())
      .not('id', 'in', `(SELECT order_id FROM payout_items)`);

    if (ordersError) {
      return NextResponse.json({ ok: false, error: ordersError.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ ok: true, settled: 0, message: 'no orders to settle' });
    }

    const now = new Date().toISOString();
    const rulesVersion = config.version ?? 'v1';

    // Compute payout items — floor like computeExpectedPayout in settlement-config.ts
    type Order = {
      id: string;
      total_twd: number;
      activities: { guide_id: string } | { guide_id: string }[];
      activity_schedules: { start_at: string } | { start_at: string }[];
    };

    const payoutItems = (orders as Order[]).map(order => {
      const guide_id = Array.isArray(order.activities)
        ? order.activities[0].guide_id
        : order.activities.guide_id;
      const gmv_twd = order.total_twd;
      const commission_twd = Math.floor(gmv_twd * config.commission_rate);
      const net_twd = Math.floor(gmv_twd * (1 - config.commission_rate));
      return {
        order_id: order.id,
        guide_id,
        gmv_twd,
        commission_twd,
        net_twd,
        rules_version: rulesVersion,
        settled_at: now,
      };
    });

    // Upsert payout_items — ON CONFLICT DO NOTHING (idempotent via UNIQUE order_id)
    // Supabase upsert with ignoreDuplicates=true maps to ON CONFLICT DO NOTHING in PostgREST
    const { error: insertError } = await supabase
      .from('payout_items')
      .upsert(payoutItems, { onConflict: 'order_id', ignoreDuplicates: true });

    if (insertError) {
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
        return NextResponse.json({ ok: false, error: balError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      settled: payoutItems.length,
      guides_updated: Object.keys(balanceDeltas).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

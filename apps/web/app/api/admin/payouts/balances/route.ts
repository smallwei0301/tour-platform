/**
 * GET /api/admin/payouts/balances
 * Issue #1365 缺口 2 — 出款管理手動操作 fallback。
 *
 * List guide settlement balances (> 0, including below min-withdrawal
 * threshold) with profile info + has_pending_payout flag, plus the active
 * min_withdrawal_twd so the UI can mark 達門檻 / 未達門檻.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { listGuideBalancesWithProfilesDb } = await import('../../../../../src/lib/db.mjs');
    const { getSettlementConfig } = await import('../../../../../src/lib/settlement-config');

    const [balances, config] = await Promise.all([
      listGuideBalancesWithProfilesDb(supabase),
      getSettlementConfig(supabase),
    ]);

    return NextResponse.json({
      ok: true,
      data: { balances, min_withdrawal_twd: config.min_withdrawal_twd },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

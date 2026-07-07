/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/payouts/balances）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
/**
 * GET /api/admin/payouts/balances
 * Issue #1365 缺口 2 — 出款管理手動操作 fallback。
 *
 * List guide settlement balances (> 0, including below min-withdrawal
 * threshold) with profile info + has_pending_payout flag, plus the active
 * min_withdrawal_twd so the UI can mark 達門檻 / 未達門檻.
 */
import { reportRouteError } from '../../../../../../src/lib/route-error';
import { NextResponse } from 'next/server';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../src/config/supabase-service-env.mjs';

export async function GET() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!
    );

    const { listGuideBalancesWithProfilesDb } = await import('../../../../../../src/lib/db.mjs');
    const { getSettlementConfig } = await import('../../../../../../src/lib/settlement-config');

    const [balances, config] = await Promise.all([
      listGuideBalancesWithProfilesDb(supabase),
      getSettlementConfig(supabase),
    ]);

    return NextResponse.json({
      ok: true,
      data: { balances, min_withdrawal_twd: config.min_withdrawal_twd },
    });
  } catch (e: any) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(e, { route: 'v2/admin/payouts/balances' });
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

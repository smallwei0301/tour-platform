/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/payouts/[payoutId]/confirm）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
/**
 * POST /api/admin/payouts/[payoutId]/confirm
 * Issue #448 — Confirm a pending payout: debit guide_balances + mark paid + audit log.
 *
 * #1777 決策 A — 真實出款目前 HOLD。confirmPayoutDb 的三段式寫入（扣餘額 →
 * pending→paid → audit）不在同一 transaction，中途失敗會留下「餘額已扣但
 * payout 仍 pending」，重試即重複扣款。Phase 2 的 fn_confirm_payout_atomic
 * 驗收前，本 route 由 fail-closed guard 擋下（預設擋，需明確設定才放行）。
 */
import { reportRouteError } from '../../../../../../../src/lib/route-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../../src/config/supabase-service-env.mjs';
import { isPayoutConfirmAllowed } from '../../../../../../../src/lib/payout-confirm-guard.mjs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ payoutId: string }> }) {
  const { payoutId } = await params;

  // HOLD gate：必須在觸及 guide_balances／payouts 之前返回，因此擺在最前面，
  // 早於 Supabase client 建立與任何 DB 讀寫。
  const gate = isPayoutConfirmAllowed();
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, code: gate.code, error: gate.reasonZh },
      { status: 503 }
    );
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!
    );

    const { confirmPayoutDb } = await import('../../../../../../../src/lib/db.mjs');

    const body = await req.json().catch(() => ({}));
    const result = await confirmPayoutDb(
      supabase,
      payoutId,
      body.confirmed_by ?? 'admin',
      body.transfer_ref ?? null
    );

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(e, { route: 'v2/admin/payouts/[payoutId]/confirm' });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

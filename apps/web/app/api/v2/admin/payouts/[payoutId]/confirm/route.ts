/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/payouts/[payoutId]/confirm）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
/**
 * POST /api/admin/payouts/[payoutId]/confirm
 * Issue #448 — Confirm a pending payout: debit guide_balances + mark paid + audit log.
 */
import { reportRouteError } from '../../../../../../../src/lib/route-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../../src/config/supabase-service-env.mjs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ payoutId: string }> }) {
  const { payoutId } = await params;

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

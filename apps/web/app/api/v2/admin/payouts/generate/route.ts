/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/payouts/generate）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
/**
 * POST /api/admin/payouts/generate
 * Issue #1365 缺口 2 — manually create a pending payout from a guide's
 * current balance (admin fallback while the settlement cron is not
 * scheduled). Body: { guide_id, actor? }.
 *
 * Idempotent: when the guide already has a pending payout, returns 409 so
 * the UI can surface the conflict instead of silently doing nothing.
 */
import { reportRouteError } from '../../../../../../src/lib/route-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../src/config/supabase-service-env.mjs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const guideId = String(body?.guide_id || '').trim();
    if (!guideId) {
      return NextResponse.json({ ok: false, error: 'guide_id is required' }, { status: 400 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!
    );

    const { generateManualPayoutDb } = await import('../../../../../../src/lib/db.mjs');
    const result = await generateManualPayoutDb(supabase, {
      guideId,
      actor: body?.actor ?? 'admin',
    });

    if (result.skipped) {
      return NextResponse.json(
        { ok: false, error: '該導遊已有待出款記錄，請先處理既有出款單', data: result },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(e, { route: 'v2/admin/payouts/generate' });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

/**
 * POST /api/admin/payouts/generate
 * Issue #1365 缺口 2 — manually create a pending payout from a guide's
 * current balance (admin fallback while the settlement cron is not
 * scheduled). Body: { guide_id, actor? }.
 *
 * Idempotent: when the guide already has a pending payout, returns 409 so
 * the UI can surface the conflict instead of silently doing nothing.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const guideId = String(body?.guide_id || '').trim();
    if (!guideId) {
      return NextResponse.json({ ok: false, error: 'guide_id is required' }, { status: 400 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { generateManualPayoutDb } = await import('../../../../../src/lib/db.mjs');
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
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

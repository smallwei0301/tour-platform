/**
 * POST /api/admin/payouts/[payoutId]/confirm
 * Issue #448 — Confirm a pending payout: debit guide_balances + mark paid + audit log.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../src/config/supabase-service-env.mjs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ payoutId: string }> }) {
  const { payoutId } = await params;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!
    );

    const { confirmPayoutDb } = await import('../../../../../../src/lib/db.mjs');

    const body = await req.json().catch(() => ({}));
    const result = await confirmPayoutDb(
      supabase,
      payoutId,
      body.confirmed_by ?? 'admin',
      body.transfer_ref ?? null
    );

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

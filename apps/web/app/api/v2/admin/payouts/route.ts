/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/payouts）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
/**
 * GET /api/admin/payouts
 * Issue #448 — List payout queue (most recent first, limit 50).
 */
import { reportRouteError } from '../../../../../src/lib/route-error';
import { NextResponse } from 'next/server';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

export async function GET() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!
    );

    const { data, error } = await supabase
      .from('payouts')
      .select('*, guide_profiles(display_name, guide_email)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const normalized = (data ?? []).map((row) => {
      const profile = row?.guide_profiles;
      if (!profile) return row;
      return {
        ...row,
        guide_profiles: {
          ...profile,
          email: profile.email ?? profile.guide_email ?? null,
        },
      };
    });

    return NextResponse.json({ ok: true, data: normalized });
  } catch (err) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(err, { route: 'v2/admin/payouts' });
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * GET /api/admin/payouts
 * Issue #448 — List payout queue (most recent first, limit 50).
 */
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
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
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

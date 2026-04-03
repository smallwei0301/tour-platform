import { NextResponse } from 'next/server';

/**
 * GET /api/admin/guides/approved
 * Returns all approved guide_profiles. Auth is handled by middleware
 * (same pattern as all other /api/admin/* routes).
 */
export async function GET() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from('guide_profiles')
      .select('id, display_name, slug, verification_status, headline, region, rating_avg, review_count, guide_email')
      .eq('verification_status', 'approved')
      .order('display_name');

    if (error) throw error;

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (err: unknown) {
    console.error('[admin/guides/approved] error:', err);
    const msg = err instanceof Error ? err.message : 'SERVER_ERROR';
    return NextResponse.json({ ok: false, error: { code: 'SERVER_ERROR', message: msg } }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { errorV2 } from '../../../../../src/lib/api';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

/**
 * GET /api/admin/guides/approved
 * Returns all approved guide_profiles. Auth is handled by middleware
 * (same pattern as all other /api/admin/* routes).
 */
export async function GET() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!
    );

    const { data, error } = await supabase
      .from('guide_profiles')
      .select('id, display_name, slug, verification_status, headline, region, rating_avg, review_count, guide_email, profile_photo_url')
      .in('verification_status', ['approved', 'suspended'])
      .order('display_name');

    if (error) throw error;

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (err: unknown) {
    console.error('[admin/guides/approved] error:', err);
    const msg = err instanceof Error ? err.message : 'SERVER_ERROR';
    return NextResponse.json(errorV2('SERVER_ERROR', msg), { status: 500 });
  }
}

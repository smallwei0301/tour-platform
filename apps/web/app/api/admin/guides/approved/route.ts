import { NextResponse } from 'next/server';
import { isAdminAuthorized } from '../../../../../src/lib/admin-auth.mjs';
import { getSupabaseClient } from '../../../../../src/lib/db.mjs';

export async function GET(req: Request) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  try {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('guide_profiles')
      .select('id, display_name, slug, verification_status, headline, region, rating_avg, review_count')
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

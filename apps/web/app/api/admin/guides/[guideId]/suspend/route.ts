import { NextResponse } from 'next/server';

/**
 * PATCH /api/admin/guides/:guideId/suspend
 * Suspend (suspend=true) or reactivate (suspend=false) a guide.
 * Suspend also bumps guide_session_version to force logout.
 * Auth via middleware.
 */
export async function PATCH(
  req: Request,
  context: { params: { guideId: string } }
) {
  const { guideId } = context.params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const suspend = !!body.suspend;

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get current profile
  const { data: profile } = await supabase
    .from('guide_profiles')
    .select('id, display_name, guide_session_version')
    .eq('id', guideId)
    .single();

  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    verification_status: suspend ? 'suspended' : 'approved',
  };

  // Bump session version on suspend to force all sessions to expire
  if (suspend) {
    updates.guide_session_version = (profile.guide_session_version ?? 1) + 1;
  }

  const { error } = await supabase
    .from('guide_profiles')
    .update(updates)
    .eq('id', guideId);

  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: guideId,
      displayName: profile.display_name,
      status: suspend ? 'suspended' : 'approved',
      sessionsInvalidated: suspend,
    }
  });
}

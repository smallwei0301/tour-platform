import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

/**
 * PATCH /api/admin/guides/:guideId/suspend
 * Suspend (suspend=true) or reactivate (suspend=false) a guide.
 * Suspend also bumps guide_session_version to force logout, and hides the
 * guide everywhere public: 認識導遊 list/detail + their activities all gate
 * on verification_status='approved' (see getGuideBySlugDb /
 * listPublishedActivitiesDb / getActivityBySlugDb). On-demand revalidation
 * below flushes the statically-cached public pages so suspend/reactivate
 * takes effect on the next traveler refresh, not the next deploy.
 * Auth via middleware.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const suspend = !!body.suspend;

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get current profile (slug drives on-demand revalidation of the public pages)
  const { data: profile } = await supabase
    .from('guide_profiles')
    .select('id, display_name, slug, guide_session_version')
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

  // Flush statically-cached public surfaces so suspend/reactivate is visible
  // on the next refresh. Activity detail pages are force-dynamic (always
  // fresh); 認識導遊 list + the guide's page are on-demand only, so revalidate
  // them explicitly. /activities list is ISR — refresh it too for immediacy.
  try {
    revalidatePath('/guides');
    if (profile.slug) revalidatePath(`/guides/${profile.slug}`);
    revalidatePath('/activities');
  } catch {
    // revalidation 失敗不影響停權結果本身。
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

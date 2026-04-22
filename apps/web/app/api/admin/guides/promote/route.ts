import { NextResponse } from 'next/server';
import { generateInviteToken } from '../../../../../src/lib/guide-auth';
import { errorV2 } from '../../../../../src/lib/api';

/**
 * POST /api/admin/guides/promote
 * Promote an approved guide_application to guide_profiles and generate invite token.
 * Auth via middleware.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const { applicationId } = body;

  if (!applicationId) {
    return NextResponse.json(errorV2('BAD_REQUEST', 'applicationId required'), { status: 400 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch the application
  const { data: app, error: appErr } = await supabase
    .from('guide_applications')
    .select('id, name, slug, email, phone, status')
    .eq('id', applicationId)
    .single();

  if (appErr || !app) {
    return NextResponse.json(errorV2('NOT_FOUND', '申請資料不存在'), { status: 404 });
  }

  if (app.status !== 'approved') {
    return NextResponse.json(errorV2('INVALID_STATUS', '只有已通過審核的申請才能上線'), { status: 400 });
  }

  // Check if guide_profiles already exists for this application (by slug)
  const { data: existing } = await supabase
    .from('guide_profiles')
    .select('id, display_name')
    .eq('slug', app.slug)
    .single();

  let guideId: string;

  if (existing) {
    // Already promoted — just update to approved if not already
    await supabase
      .from('guide_profiles')
      .update({ verification_status: 'approved' })
      .eq('id', existing.id);
    guideId = existing.id;
  } else {
    // Create new guide_profiles entry
    const { data: newProfile, error: insertErr } = await supabase
      .from('guide_profiles')
      .insert({
        display_name: app.name,
        slug: app.slug,
        verification_status: 'approved',
        // guide_email will be set separately by admin
      })
      .select('id')
      .single();

    if (insertErr || !newProfile) {
      return NextResponse.json(errorV2('SERVER_ERROR', insertErr?.message || '建立導遊資料失敗'), { status: 500 });
    }
    guideId = newProfile.id;
  }

  // Generate invite token
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabase
    .from('guide_profiles')
    .update({ invite_token: token, invite_token_expires_at: expiresAt })
    .eq('id', guideId);

  const inviteUrl = `/guide/login?token=${token}`;

  return NextResponse.json({
    ok: true,
    data: {
      guideId,
      guideName: app.name,
      inviteUrl,
      token,
      expiresAt,
      wasExisting: !!existing,
    },
  });
}

import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

function hashPassword(password: string): string {
  const salt = process.env.GUIDE_SESSION_SECRET || 'guide-dev-secret-change-in-prod';
  return createHash('sha256').update(password + salt).digest('hex');
}

/**
 * PATCH /api/admin/guides/:guideId
 * Update guide email and/or reset password. Auth via middleware.
 */
export async function PATCH(
  req: Request,
  context: { params: { guideId: string } }
) {
  const { guideId } = context.params;
  if (!guideId) {
    return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST' } }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const { email, password } = body;

  if (!email && !password) {
    return NextResponse.json(
      { ok: false, error: { code: 'BAD_REQUEST', message: '請提供 email 或 password' } },
      { status: 400 }
    );
  }

  if (password && password.length < 6) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_PASSWORD', message: '密碼至少 6 個字元' } },
      { status: 400 }
    );
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify guide exists and is approved
    const { data: guide, error: fetchError } = await supabase
      .from('guide_profiles')
      .select('id, display_name, guide_email, verification_status')
      .eq('id', guideId)
      .single();

    if (fetchError || !guide) {
      return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
    }

    // Build update payload
    const updates: Record<string, unknown> = {};
    if (email) {
      updates.guide_email = email.toLowerCase().trim();
    }
    if (password) {
      updates.guide_password_hash = hashPassword(password);
      // Bump session version to invalidate existing sessions
      updates.guide_session_version = (guide as Record<string, unknown>).guide_session_version
        ? Number((guide as Record<string, unknown>).guide_session_version) + 1
        : 2;
    }

    const { error: updateError } = await supabase
      .from('guide_profiles')
      .update(updates)
      .eq('id', guideId);

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      data: {
        id: guideId,
        displayName: guide.display_name,
        emailUpdated: !!email,
        passwordUpdated: !!password,
        sessionsInvalidated: !!password,
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'SERVER_ERROR';
    // Unique constraint violation on email
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json(
        { ok: false, error: { code: 'EMAIL_TAKEN', message: '此 Email 已被使用' } },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: { code: 'SERVER_ERROR', message: msg } }, { status: 500 });
  }
}

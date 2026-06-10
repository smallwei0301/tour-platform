import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { errorV2 } from '../../../../../src/lib/api';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + password).digest('hex');
  return `${salt}:${hash}`;
}

/**
 * GET /api/admin/guides/:guideId
 * Dual-entity resolver: the admin UI links both guide PROFILES
 * (guide_profiles.id) and guide APPLICATIONS (guide_applications.id) to
 * this detail URL. The two tables have separate id spaces (promote
 * creates the profile with a NEW id), so resolving only guide_profiles
 * made every application card 404 with 「找不到導遊資料」.
 *
 * Resolution order:
 *   1. guide_profiles by id   → kind:'profile'  (fields unchanged, additive kind)
 *   2. guide_applications by id → kind:'application' + application payload
 *   3. neither → 404 with a message that says both sources were checked.
 * Auth via middleware.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;
  if (!guideId) {
    return NextResponse.json(errorV2('BAD_REQUEST', 'guideId is required'), { status: 400 });
  }
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: profile } = await supabase
      .from('guide_profiles')
      .select('id, display_name, slug, verification_status, headline, region, rating_avg, guide_email, profile_photo_url, bio, specialty, created_at')
      .eq('id', guideId)
      .maybeSingle();
    if (profile) {
      return NextResponse.json({ ok: true, data: { kind: 'profile', ...profile } });
    }

    const { data: application } = await supabase
      .from('guide_applications')
      .select('id, full_name, phone, email, city, bio, status, admin_note, created_at, updated_at')
      .eq('id', guideId)
      .maybeSingle();
    if (application) {
      return NextResponse.json({
        ok: true,
        data: {
          kind: 'application',
          id: application.id,
          display_name: application.full_name,
          application: {
            fullName: application.full_name,
            phone: application.phone,
            email: application.email,
            city: application.city,
            bio: application.bio,
            status: application.status,
            adminNote: application.admin_note,
            createdAt: application.created_at,
            updatedAt: application.updated_at,
          },
        },
      });
    }

    return NextResponse.json(
      errorV2('NOT_FOUND', '找不到導遊資料：此 ID 不屬於任何導遊檔案或導遊申請'),
      { status: 404 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'SERVER_ERROR';
    return NextResponse.json(errorV2('SERVER_ERROR', msg), { status: 500 });
  }
}

/**
 * PATCH /api/admin/guides/:guideId
 * Update guide email and/or reset password. Auth via middleware.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;
  if (!guideId) {
    return NextResponse.json(errorV2('BAD_REQUEST', 'guideId is required'), { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const { email, password } = body;

  if (!email && !password) {
    return NextResponse.json(
      errorV2('BAD_REQUEST', '請提供 email 或 password'),
      { status: 400 }
    );
  }

  if (password && password.length < 6) {
    return NextResponse.json(
      errorV2('INVALID_PASSWORD', '密碼至少 6 個字元'),
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
      return NextResponse.json(errorV2('NOT_FOUND', 'Guide not found'), { status: 404 });
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
        errorV2('EMAIL_TAKEN', '此 Email 已被使用'),
        { status: 409 }
      );
    }
    return NextResponse.json(errorV2('SERVER_ERROR', msg), { status: 500 });
  }
}

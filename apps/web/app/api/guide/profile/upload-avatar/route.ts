// Guide self-service avatar upload.
// Mirrors /api/admin/guides/[guideId]/upload-avatar but authenticates via the
// guide_token cookie (no admin token needed) and pins the bucket path to
// session.guideId so a guide can't write to another guide's prefix.
import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../src/lib/csrf.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

const BUCKET = 'guides';

export async function POST(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const SUPABASE_URL = getSupabaseUrl();
  const SUPABASE_SERVICE_KEY = getSupabaseServiceRoleKey();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json(fail('NOT_CONFIGURED', 'supabase storage not configured'), { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return Response.json(fail('INVALID_REQUEST', 'file is required'), { status: 400 });

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return Response.json(fail('INVALID_FILE_TYPE', '僅支援 JPG、PNG、WebP 格式'), { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return Response.json(fail('FILE_TOO_LARGE', '檔案大小不能超過 5MB'), { status: 400 });
    }

    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${session.guideId}/avatar-${Date.now()}.${ext}`;

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': file.type,
        'Cache-Control': 'max-age=31536000',
        'x-upsert': 'true',
      },
      body: await file.arrayBuffer(),
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[guide upload-avatar] storage error:', errText);
      return Response.json(fail('UPLOAD_ERROR', errText), { status: 500 });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error: updateError } = await supabase
      .from('guide_profiles')
      .update({ profile_photo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', session.guideId);

    if (updateError) {
      console.error('[guide upload-avatar] DB update error:', updateError);
      return Response.json(fail('DB_ERROR', updateError.message), { status: 500 });
    }

    return Response.json(ok({ url: publicUrl, path }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[guide upload-avatar] error:', message);
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

import { ok, fail } from '../../../../../../src/lib/api';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'guides';

/**
 * POST /api/admin/guides/:guideId/upload-avatar
 * Upload guide profile photo (avatar)
 * - Accepts: image/jpeg, image/png, image/webp
 * - Max size: 5MB (enforced by bucket config)
 * - Storage path: guides/{guideId}/avatar.webp
 */
export async function POST(request: Request, context: { params: Promise<{ guideId: string }> }) {
  const { guideId } = await context.params;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return Response.json(fail('INVALID_REQUEST', 'file is required'), { status: 400 });
    }

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return Response.json(fail('INVALID_FILE_TYPE', '僅支援 JPG、PNG、WebP 格式'), { status: 400 });
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return Response.json(fail('FILE_TOO_LARGE', '檔案大小不能超過 5MB'), { status: 400 });
    }

    const ext = file.type === 'image/webp' ? 'webp' : (file.type === 'image/png' ? 'png' : 'jpg');
    const timestamp = Date.now();
    const filename = `avatar-${timestamp}.${ext}`;
    const path = `${guideId}/${filename}`;

    const arrayBuffer = await file.arrayBuffer();

    // Upload to Supabase Storage
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': file.type,
          'Cache-Control': 'max-age=31536000',
          'x-upsert': 'true', // Overwrite if exists
        },
        body: arrayBuffer,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[upload-avatar] Storage error:', errText);
      return Response.json(fail('UPLOAD_ERROR', errText), { status: 500 });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

    // Update guide_profiles.profile_photo_url
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { error: updateError } = await supabase
      .from('guide_profiles')
      .update({ profile_photo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', guideId);

    if (updateError) {
      console.error('[upload-avatar] DB update error:', updateError);
      return Response.json(fail('DB_ERROR', updateError.message), { status: 500 });
    }

    return Response.json(ok({ url: publicUrl, path }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[upload-avatar] Error:', message);
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

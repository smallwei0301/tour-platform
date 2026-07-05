// Guide self-service hero (cover) image upload.
// 16:9 ratio (±10%) validated server-side with sharp, same rule as
// /api/admin/activities/[id]/upload-image type=cover. Bucket path is pinned
// to session.guideId so a guide can't write to another guide's prefix.
import sharp from 'sharp';
import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../src/lib/csrf.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

const BUCKET = 'guides';

async function validateHeroDimensions(file: File): Promise<{ valid: boolean; error?: string }> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      return { valid: false, error: '無法解析圖片尺寸' };
    }
    const { width, height } = metadata;
    const aspectRatio = width / height;
    const target = 16 / 9;
    const tolerance = 0.1;
    if (aspectRatio < target * (1 - tolerance) || aspectRatio > target * (1 + tolerance)) {
      return { valid: false, error: `Hero 圖比例應為 16:9，目前為 ${aspectRatio.toFixed(2)}:1` };
    }
    if (width < 1280 || height < 720) {
      return { valid: false, error: `Hero 圖最小尺寸為 1280×720，目前為 ${width}×${height}` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: '無法讀取圖片' };
  }
}

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
    if (file.size > 10 * 1024 * 1024) {
      return Response.json(fail('FILE_TOO_LARGE', '檔案大小不能超過 10MB'), { status: 400 });
    }

    const dim = await validateHeroDimensions(file);
    if (!dim.valid) {
      return Response.json(fail('INVALID_DIMENSIONS', dim.error ?? '尺寸驗證失敗'), { status: 400 });
    }

    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${session.guideId}/hero-${Date.now()}.${ext}`;

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
      console.error('[guide upload-hero] storage error:', errText);
      return Response.json(fail('UPLOAD_ERROR', errText), { status: 500 });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error: updateError } = await supabase
      .from('guide_profiles')
      .update({ hero_image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', session.guideId);

    if (updateError) {
      console.error('[guide upload-hero] DB update error:', updateError);
      return Response.json(fail('DB_ERROR', updateError.message), { status: 500 });
    }

    return Response.json(ok({ url: publicUrl, path }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[guide upload-hero] error:', message);
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

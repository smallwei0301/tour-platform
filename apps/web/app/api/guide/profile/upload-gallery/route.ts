// Guide self-service gallery upload — one image per call.
// 3:2 ratio (±15%) validated server-side; new URL is appended to the
// guide_profiles.gallery_urls jsonb array, capped at GALLERY_MAX. Returns
// the full new array so the client can update its state without a round-trip.
import sharp from 'sharp';
import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../src/lib/csrf.mjs';

const BUCKET = 'guides';
const GALLERY_MAX = 12;

async function validateGalleryDimensions(file: File): Promise<{ valid: boolean; error?: string }> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      return { valid: false, error: '無法解析圖片尺寸' };
    }
    const { width, height } = metadata;
    const aspectRatio = width / height;
    const target = 3 / 2;
    const tolerance = 0.15;
    if (aspectRatio < target * (1 - tolerance) || aspectRatio > target * (1 + tolerance)) {
      return { valid: false, error: `照片比例應為 3:2，目前為 ${aspectRatio.toFixed(2)}:1` };
    }
    if (width < 800 || height < 533) {
      return { valid: false, error: `照片最小尺寸為 800×533，目前為 ${width}×${height}` };
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

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

    const dim = await validateGalleryDimensions(file);
    if (!dim.valid) {
      return Response.json(fail('INVALID_DIMENSIONS', dim.error ?? '尺寸驗證失敗'), { status: 400 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Re-read current gallery_urls so we can enforce the cap and append safely.
    const { data: gp, error: gpErr } = await supabase
      .from('guide_profiles')
      .select('gallery_urls')
      .eq('id', session.guideId)
      .single();
    if (gpErr || !gp) {
      return Response.json(fail('NOT_FOUND', 'guide profile not found'), { status: 404 });
    }
    const current: string[] = Array.isArray(gp.gallery_urls) ? gp.gallery_urls : [];
    if (current.length >= GALLERY_MAX) {
      return Response.json(fail('GALLERY_FULL', `照片集已達上限 ${GALLERY_MAX} 張`), { status: 400 });
    }

    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${session.guideId}/gallery-${Date.now()}.${ext}`;

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
      console.error('[guide upload-gallery] storage error:', errText);
      return Response.json(fail('UPLOAD_ERROR', errText), { status: 500 });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    const next = [...current, publicUrl];

    const { error: updateError } = await supabase
      .from('guide_profiles')
      .update({ gallery_urls: next, updated_at: new Date().toISOString() })
      .eq('id', session.guideId);

    if (updateError) {
      console.error('[guide upload-gallery] DB update error:', updateError);
      return Response.json(fail('DB_ERROR', updateError.message), { status: 500 });
    }

    return Response.json(ok({ url: publicUrl, path, gallery_urls: next }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[guide upload-gallery] error:', message);
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

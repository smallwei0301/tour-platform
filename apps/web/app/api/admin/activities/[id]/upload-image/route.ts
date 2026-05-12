import sharp from 'sharp';
import { ok, fail } from '../../../../../../src/lib/api';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'activity-images';

/**
 * Image dimension validation (Server-side with sharp)
 */
async function validateImageDimensions(
  file: File,
  type: 'cover' | 'gallery'
): Promise<{ valid: boolean; error?: string }> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.width || !metadata.height) {
      return { valid: false, error: '無法解析圖片尺寸' };
    }

    const { width, height } = metadata;
    const aspectRatio = width / height;

    if (type === 'cover') {
      // Hero: 16:9 aspect ratio (tolerance ±10%)
      const target = 16 / 9;
      const tolerance = 0.1;
      const minRatio = target * (1 - tolerance);
      const maxRatio = target * (1 + tolerance);

      if (aspectRatio < minRatio || aspectRatio > maxRatio) {
        return {
          valid: false,
          error: `Hero 圖比例應為 16:9，目前為 ${(aspectRatio).toFixed(2)}:1`,
        };
      } else if (width < 1280 || height < 720) {
        return {
          valid: false,
          error: `Hero 圖最小尺寸為 1280×720，目前為 ${width}×${height}`,
        };
      }
    } else {
      // Gallery: 3:2 aspect ratio (tolerance ±15%)
      const target = 3 / 2;
      const tolerance = 0.15;
      const minRatio = target * (1 - tolerance);
      const maxRatio = target * (1 + tolerance);

      if (aspectRatio < minRatio || aspectRatio > maxRatio) {
        return {
          valid: false,
          error: `照片比例應為 3:2，目前為 ${(aspectRatio).toFixed(2)}:1`,
        };
      } else if (width < 800 || height < 533) {
        return {
          valid: false,
          error: `照片最小尺寸為 800×533，目前為 ${width}×${height}`,
        };
      }
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: '無法讀取圖片' };
  }
}

/**
 * POST /api/admin/activities/:id/upload-image
 * Upload activity cover (hero) or gallery images
 * - type: 'cover' for hero image (16:9, min 1280x720)
 * - type: 'gallery' for gallery images (3:2, min 800x533)
 * - Accepts: image/jpeg, image/png, image/webp (WebP preferred from frontend compression)
 *
 * Frontend should pre-compress and crop before upload:
 * - cover → 1920×1080 WebP (16:9)
 * - gallery → 1200×800 WebP (3:2)
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const rawSlug = (formData.get('slug') as string) || id;
    const type = (formData.get('type') as string) || 'cover'; // 'cover' | 'gallery'

    if (!file) {
      return Response.json(fail('INVALID_REQUEST', 'file is required'), { status: 400 });
    }

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return Response.json(fail('INVALID_FILE_TYPE', '僅支援 JPG、PNG、WebP 格式'), { status: 400 });
    }

    // Validate file size based on type
    const maxSize = type === 'cover' ? 10 * 1024 * 1024 : 5 * 1024 * 1024; // 10MB for cover, 5MB for gallery
    if (file.size > maxSize) {
      const maxMB = maxSize / 1024 / 1024;
      return Response.json(fail('FILE_TOO_LARGE', `檔案大小不能超過 ${maxMB}MB`), { status: 400 });
    }

    // Validate image dimensions and aspect ratio
    const validation = await validateImageDimensions(file, type as 'cover' | 'gallery');
    if (!validation.valid) {
      return Response.json(fail('INVALID_DIMENSIONS', validation.error ?? '尺寸驗證失敗'), { status: 400 });
    }

    // Sanitize slug: keep alphanumeric, hyphen, underscore only
    const slug = rawSlug
      .replace(/[^\w-]/g, '-')   // Non-alphanumeric/underscore/hyphen → -
      .replace(/-{2,}/g, '-')    // Consecutive hyphens → single
      .replace(/^-|-$/g, '')     // Trim leading/trailing hyphens
      || id;                     // Fallback to id if empty

    const timestamp = Date.now();
    const ext = file.type === 'image/webp' ? 'webp' : (file.type === 'image/png' ? 'png' : 'jpg');

    // Naming: cover → hero-{timestamp}.ext, gallery → gallery-{timestamp}.ext
    const prefix = type === 'cover' ? 'hero' : 'gallery';
    const filename = `${prefix}-${timestamp}.${ext}`;
    const path = `activities/${slug}/${filename}`;

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
          'x-upsert': 'true', // Allow overwrite if exists
        },
        body: arrayBuffer,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[upload-image] Storage error:', errText);
      return Response.json(fail('UPLOAD_ERROR', errText), { status: 500 });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

    return Response.json(ok({
      url: publicUrl,
      path,
      type,
      timestamp,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[upload-image] Error:', message);
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

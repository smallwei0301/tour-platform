import { ok, fail } from '../../../../../../src/lib/api';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'activity-images';

/**
 * POST /api/admin/activities/:id/upload-image
 * Upload activity cover (hero) or gallery images
 * - type: 'cover' for hero image (16:9, 1920x1080)
 * - type: 'gallery' for gallery images (3:2, 1200x800)
 * - Accepts: image/jpeg, image/png, image/webp (WebP preferred from frontend compression)
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

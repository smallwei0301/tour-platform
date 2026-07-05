// Applicant photo upload for the guide application form.
// Applicants have no session yet (guide_token only exists after promote +
// first login), so this endpoint is anonymous by design — the same trust
// level as POST /api/guide-applications itself. Abuse surface is bounded
// by per-IP rate limiting, a strict MIME/size whitelist, and a storage
// prefix (`applications/<random>/`) that is disjoint from real guide
// prefixes (`<guideId>/...`), so an applicant can never write into an
// existing guide's folder.
import { ok, fail } from '../../../../src/lib/api';
import { RateLimiter, createRateLimitResponse } from '../../../../src/lib/rate-limit';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../src/config/supabase-service-env.mjs';

const BUCKET = 'guides';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const KIND_LIMITS: Record<string, number> = {
  avatar: 5 * 1024 * 1024,
  hero: 10 * 1024 * 1024,
  gallery: 5 * 1024 * 1024,
};

// 匿名端點限流：單一 IP 每分鐘最多 12 次上傳（個人照 1 + 封面 1 + 活動照 6 + 重傳餘裕）。
const applicationUploadLimiter = new RateLimiter(12, 60 * 1000);

export async function POST(request: Request) {
  const limit = applicationUploadLimiter.check(RateLimiter.getClientIp(request));
  const limited = createRateLimitResponse(limit);
  if (limited) return limited;

  const SUPABASE_URL = getSupabaseUrl();
  const SUPABASE_SERVICE_KEY = getSupabaseServiceRoleKey();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json(fail('NOT_CONFIGURED', 'supabase storage not configured'), { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const kind = String(formData.get('kind') || '');

    if (!Object.prototype.hasOwnProperty.call(KIND_LIMITS, kind)) {
      return Response.json(fail('INVALID_REQUEST', 'kind must be avatar | hero | gallery'), { status: 400 });
    }
    if (!file) return Response.json(fail('INVALID_REQUEST', 'file is required'), { status: 400 });

    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json(fail('INVALID_FILE_TYPE', '僅支援 JPG、PNG、WebP 格式'), { status: 400 });
    }
    const maxSize = KIND_LIMITS[kind];
    if (file.size > maxSize) {
      return Response.json(
        fail('FILE_TOO_LARGE', `檔案大小不能超過 ${Math.round(maxSize / 1024 / 1024)}MB`),
        { status: 400 },
      );
    }

    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = `applications/${crypto.randomUUID()}/${kind}-${Date.now()}.${ext}`;

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
      console.error('[guide-applications upload] storage error:', errText);
      return Response.json(fail('UPLOAD_ERROR', '照片上傳失敗，請稍後再試'), { status: 500 });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    return Response.json(ok({ url: publicUrl, path, kind }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[guide-applications upload] error:', message);
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

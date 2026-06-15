// 旅客評價照片上傳 — 一次一張。
// 認證：旅客 Supabase session（與 /api/reviews 一致）；CSRF 由 middleware 對
// /api/reviews 統一把關（double-submit token）。
// 上傳到公開 bucket `review-photos`，回傳 public URL，由前端蒐集後隨評論一起送出。
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { createClient } from '../../../../src/lib/supabase/server';
import { reviewSubmitLimiter, RateLimiter, createRateLimitResponse } from '../../../../src/lib/rate-limit';

const BUCKET = 'review-photos';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(req: NextRequest) {
  // 與評論提交共用 rate limit 桶（5 次/分鐘/IP）避免被當圖床濫用。
  const rateResult = reviewSubmitLimiter.check(`review-photo:${RateLimiter.getClientIp(req)}`);
  const rateLimited = createRateLimitResponse(rateResult);
  if (rateLimited) return rateLimited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(fail('UNAUTHORIZED', 'login required'), { status: 401 });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json(fail('NOT_CONFIGURED', 'supabase storage not configured'), { status: 503 });
  }

  let file: File | null = null;
  try {
    const formData = await req.formData();
    file = formData.get('file') as File | null;
  } catch {
    return NextResponse.json(fail('INVALID_REQUEST', 'invalid multipart body'), { status: 400 });
  }
  if (!file) return NextResponse.json(fail('INVALID_REQUEST', 'file is required'), { status: 400 });

  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(fail('INVALID_FILE_TYPE', '僅支援 JPG、PNG、WebP 格式'), { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(fail('FILE_TOO_LARGE', '檔案大小不能超過 5MB'), { status: 400 });
  }

  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${user.id}/${Date.now()}-${rand}.${ext}`;

  try {
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
      console.error('[reviews upload-photo] storage error:', errText);
      return NextResponse.json(fail('UPLOAD_ERROR', '照片上傳失敗，請稍後再試'), { status: 500 });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    return NextResponse.json(ok({ url: publicUrl, path }), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[reviews upload-photo] error:', message);
    return NextResponse.json(fail('SERVER_ERROR', '照片上傳失敗，請稍後再試'), { status: 500 });
  }
}

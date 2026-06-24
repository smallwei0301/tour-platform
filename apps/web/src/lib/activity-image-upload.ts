/**
 * 行程圖片上傳共用邏輯（admin 與 guide 路由共用，見「共用同一套」設計目標）。
 *
 * 抽自原 app/api/admin/activities/[id]/upload-image/route.ts，行為不變：
 *   - cover：16:9（±10%），最小 1280×720
 *   - gallery：3:2（±15%），最小 800×533
 *   - review：暖場口碑語錄照片，與旅客評價共用 review-photos 桶，不限比例
 */
import sharp from 'sharp';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'activity-images';

export type UploadImageType = 'cover' | 'gallery' | 'review';

export async function validateImageDimensions(
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
      const target = 16 / 9;
      const tolerance = 0.1;
      if (aspectRatio < target * (1 - tolerance) || aspectRatio > target * (1 + tolerance)) {
        return { valid: false, error: `Hero 圖比例應為 16:9，目前為 ${aspectRatio.toFixed(2)}:1` };
      } else if (width < 1280 || height < 720) {
        return { valid: false, error: `Hero 圖最小尺寸為 1280×720，目前為 ${width}×${height}` };
      }
    } else {
      const target = 3 / 2;
      const tolerance = 0.15;
      if (aspectRatio < target * (1 - tolerance) || aspectRatio > target * (1 + tolerance)) {
        return { valid: false, error: `照片比例應為 3:2，目前為 ${aspectRatio.toFixed(2)}:1` };
      } else if (width < 800 || height < 533) {
        return { valid: false, error: `照片最小尺寸為 800×533，目前為 ${width}×${height}` };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: '無法讀取圖片' };
  }
}

export interface UploadActivityImageResult {
  ok: boolean;
  status: number;
  code?: string;
  error?: string;
  url?: string;
  path?: string;
  type?: UploadImageType;
  timestamp?: number;
}

/**
 * 驗證並上傳一張行程圖片到 Supabase Storage。
 * 純資料流（不含 auth / ownership）—— 呼叫端負責先驗身份與歸屬。
 */
export async function uploadActivityImage({
  file,
  type,
  rawSlug,
  idFallback,
}: {
  file: File | null;
  type: UploadImageType;
  rawSlug: string;
  idFallback: string;
}): Promise<UploadActivityImageResult> {
  const isReview = type === 'review';
  const bucket = isReview ? 'review-photos' : BUCKET;

  if (!file) return { ok: false, status: 400, code: 'INVALID_REQUEST', error: 'file is required' };

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { ok: false, status: 400, code: 'INVALID_FILE_TYPE', error: '僅支援 JPG、PNG、WebP 格式' };
  }

  const maxSize = type === 'cover' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return { ok: false, status: 400, code: 'FILE_TOO_LARGE', error: `檔案大小不能超過 ${maxSize / 1024 / 1024}MB` };
  }

  if (!isReview) {
    const validation = await validateImageDimensions(file, type as 'cover' | 'gallery');
    if (!validation.valid) {
      return { ok: false, status: 400, code: 'INVALID_DIMENSIONS', error: validation.error ?? '尺寸驗證失敗' };
    }
  }

  const slug =
    rawSlug
      .replace(/[^\w-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '') || idFallback;

  const timestamp = Date.now();
  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
  const prefix = isReview ? 'quote' : type === 'cover' ? 'hero' : 'gallery';
  const filename = `${prefix}-${timestamp}.${ext}`;
  const path = isReview ? `reviews/${slug}/${filename}` : `activities/${slug}/${filename}`;

  const arrayBuffer = await file.arrayBuffer();
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': file.type,
      'Cache-Control': 'max-age=31536000',
      'x-upsert': 'true',
    },
    body: arrayBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error('[upload-image] Storage error:', errText);
    return { ok: false, status: 500, code: 'UPLOAD_ERROR', error: errText };
  }

  return {
    ok: true,
    status: 200,
    url: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`,
    path,
    type,
    timestamp,
  };
}

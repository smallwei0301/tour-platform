import { ok, fail } from '../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { assertActivityBelongsToGuide } from '../../../../../../src/lib/assert-activity-belongs-to-guide';
import { uploadActivityImage, type UploadImageType } from '../../../../../../src/lib/activity-image-upload';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../src/config/supabase-service-env.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
}

/**
 * POST /api/guide/activities/:id/upload-image
 * 導遊上傳自己行程的圖片 —— 先驗 session，再驗 guide_id 歸屬（計劃邊角案例 #2），
 * 上傳邏輯與 admin 路由共用同一份 helper。
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const { id } = await context.params;

  // Ownership：非自己的行程一律 404（不洩漏存在性）。
  const supabase = await getSupabase();
  const owns = await assertActivityBelongsToGuide({ activityId: id, guideId: session.guideId, supabase });
  if (!owns.ok) {
    return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const rawSlug = (formData.get('slug') as string) || id;
    const type = ((formData.get('type') as string) || 'cover') as UploadImageType;

    const result = await uploadActivityImage({ file, type, rawSlug, idFallback: id });
    if (!result.ok) {
      return Response.json(fail(result.code ?? 'UPLOAD_ERROR', result.error ?? '上傳失敗'), { status: result.status });
    }
    return Response.json(ok({ url: result.url, path: result.path, type: result.type, timestamp: result.timestamp }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[guide upload-image] Error:', message);
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

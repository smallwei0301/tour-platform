import { ok, fail } from '../../../../../../src/lib/api';
import { uploadActivityImage, type UploadImageType } from '../../../../../../src/lib/activity-image-upload';

/**
 * POST /api/admin/activities/:id/upload-image
 * 上傳行程封面（cover, 16:9）/ 相簿（gallery, 3:2）/ 暖場語錄照片（review，不限比例）。
 * 驗證與上傳邏輯共用 src/lib/activity-image-upload.ts（guide 路由亦共用）。
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const formData = await request.formData();
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
    console.error('[upload-image] Error:', message);
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { ok, fail } from '../../../../../../src/lib/api';
import { getGuideDeletePrecheckDb } from '../../../../../../src/lib/db-guide-delete.mjs';

/**
 * GET /api/admin/guides/:guideId/delete-precheck
 * 刪除前預檢（modal UX 用）：回報實體種類、名下活動數、是否被
 * 訂單／撥款紀錄擋刪（附各表筆數）。DELETE 端點內部仍會權威重查，
 * 此路由僅供前端在確認視窗提前顯示後果。Auth via middleware。
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;
  if (!guideId) {
    return NextResponse.json(fail('BAD_REQUEST', 'guideId is required'), { status: 400 });
  }
  try {
    const result = await getGuideDeletePrecheckDb(guideId);
    if (!result.ok) {
      return NextResponse.json(
        fail('NOT_FOUND', '找不到導遊資料：此 ID 不屬於任何導遊檔案或導遊申請'),
        { status: 404 }
      );
    }
    return NextResponse.json(ok(result));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'SERVER_ERROR';
    return NextResponse.json(fail('SERVER_ERROR', msg), { status: 500 });
  }
}

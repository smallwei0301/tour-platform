// GET /api/guides/[slug]/shop — 導遊商店頁聚合（#1475）
// 回傳導遊公開資訊 + 各（已發佈）行程的 active 方案，依地區分組。
// 不含任何不公開匯款資訊。flag off 時 404（與商店頁一致）。
import { ok, fail } from '../../../../../src/lib/api';
import { getGuideShopDb } from '../../../../../src/lib/db.mjs';
import { isGuideShopEnabled } from '../../../../../src/config/feature-flags.mjs';

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!isGuideShopEnabled()) {
    return Response.json(fail('NOT_FOUND', 'guide shop disabled'), { status: 404 });
  }
  const { slug } = await context.params;
  try {
    const data = await getGuideShopDb(slug);
    if (!data) return Response.json(fail('NOT_FOUND', 'guide not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

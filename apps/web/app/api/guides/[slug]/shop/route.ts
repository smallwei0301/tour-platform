// GET /api/guides/[slug]/shop — 導遊商店頁聚合（#1475）
// 回傳導遊公開資訊 + 各（已發佈）行程的 active 方案，依地區分組。
// 不含任何不公開匯款資訊。flag off 時 404（與商店頁一致）。
//
// 邊緣快取（#1475）：商店頁屬展示型公開資料，對成功回應加 s-maxage=60 +
// stale-while-revalidate，讓 Vercel CDN 邊緣秒回（連 serverless 冷開機都跳過），
// 導遊改方案後最多約 60 秒反映。只快取「公開、成功」回應；404/500 不快取。
import { ok, fail } from '../../../../../src/lib/api';
import { getGuideShopDb } from '../../../../../src/lib/db.mjs';
import { isGuideShopEnabled } from '../../../../../src/config/feature-flags.mjs';

const SHOP_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!isGuideShopEnabled()) {
    return Response.json(fail('NOT_FOUND', 'guide shop disabled'), { status: 404 });
  }
  const { slug } = await context.params;
  try {
    const data = await getGuideShopDb(slug);
    if (!data) return Response.json(fail('NOT_FOUND', 'guide not found'), { status: 404 });
    return Response.json(ok(data), { headers: { 'Cache-Control': SHOP_CACHE_CONTROL } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

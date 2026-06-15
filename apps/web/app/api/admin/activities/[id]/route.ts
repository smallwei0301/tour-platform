import { revalidateTag } from 'next/cache';
import { ok, fail } from '../../../../../src/lib/api';
import { getAdminActivityByIdDb, updateActivityDb, deleteActivityDb } from '../../../../../src/lib/db.mjs';
import { buildFaqPatch } from '../../../../../src/lib/faq-route-helpers';
import { getFaqRevalidationTag } from '../../../../../src/lib/faq-validate.mjs';
import { revalidateActivityPaths } from '../../../../../src/lib/revalidate-activity.mjs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const data = await getAdminActivityByIdDb(id);
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  // AC#4: Validate FAQ entries if present in the payload
  if (body.faq !== undefined) {
    const faqResult = buildFaqPatch(body.faq);
    if (faqResult.ok === false) {
      return Response.json(fail('VALIDATION_ERROR', faqResult.message), { status: 400 });
    }
    // Normalise to canonical {question, answer} shape before saving
    body.faq = faqResult.normalised;
  }

  try {
    const data = await updateActivityDb(id, body);
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });

    // AC#5: Revalidate activity detail page cache after any update (including FAQ)
    if (data.slug) {
      revalidateTag(getFaqRevalidationTag(data.slug));
    }
    // 詳情頁改 ISR（#502 後續）：編輯後立即刷新該頁與列表的 CDN 快取，
    // 不必等 60s revalidate window，admin 改完即時可見。
    // 需帶 regionSlug：詳情頁 URL 的地區 segment 是正規化 slug，少帶會打錯路徑（#1440）。
    revalidateActivityPaths({ region: data.region, regionSlug: data.regionSlug, slug: data.slug });

    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const result = await deleteActivityDb(id);
    // 刪除後刷新列表與（若有）該行程詳情頁的 ISR 快取，避免殘留 410/舊頁。
    revalidateActivityPaths({
      region: (result as { region?: string } | null)?.region,
      regionSlug: (result as { regionSlug?: string } | null)?.regionSlug,
      slug: (result as { slug?: string } | null)?.slug,
    });
    return Response.json(ok(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

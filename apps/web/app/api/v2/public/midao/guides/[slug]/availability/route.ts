/**
 * GET /api/v2/public/midao/guides/[slug]/availability?month=YYYY-MM — 旅客端可選日期。
 * 無 auth；只回開放時段（openPeriods），不回需求單/訂單細節。
 */
import { getPublicMidaoPageDb } from '../../../../../../../../src/lib/db-midao-showcase.mjs';
import { getMonthEffectiveDb } from '../../../../../../../../src/lib/db-midao-availability.mjs';
import { jsonOk, jsonError } from '../../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../../src/lib/route-error';

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? '';
  if (!MONTH_RE.test(month)) return jsonError('INVALID_MONTH', '月份格式需為 YYYY-MM', 400);
  const mm = Number(month.slice(5, 7));
  if (mm < 1 || mm > 12) return jsonError('INVALID_MONTH', '月份格式需為 YYYY-MM', 400);
  try {
    const page = await getPublicMidaoPageDb(slug);
    if (!page) return jsonError('NOT_FOUND', '找不到此接案頁', 404);
    const days = (await getMonthEffectiveDb(page.guideId, month)).map((d) => ({
      date: d.date,
      openPeriods: [
        ...(d.morning ? ['morning'] : []),
        ...(d.afternoon ? ['afternoon'] : []),
        ...(d.evening ? ['evening'] : []),
      ],
    }));
    return jsonOk({ month, days });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/public/midao/guides:availability' });
  }
}

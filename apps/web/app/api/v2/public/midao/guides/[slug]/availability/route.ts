/**
 * GET /api/v2/public/midao/guides/[slug]/availability?month=YYYY-MM — 旅客端可選日期。
 * 無 auth；只回開放時段（openPeriods），不回需求單/訂單細節。
 * #1760 Stage 2（Owner APPROVE_A）：可用性讀取來源改為 canonical effective availability，
 * URL、回應形狀、openPeriods 契約、公開資料邊界與 fail-closed 行為皆不變；本路由無任何寫入。
 */
import { getPublicMidaoPageDb } from '../../../../../../../../src/lib/midao/db-midao-showcase.mjs';
import { getCanonicalMonthCalendarDb } from '../../../../../../../../src/lib/midao/db-midao-canonical-availability.mjs';
import { canonicalRangesToOpenPeriods } from '../../../../../../../../src/lib/midao/midao-calendar-canonical.ts';
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
    const days = (await getCanonicalMonthCalendarDb(page.guideId, month)).map(
      (d: { date: string; ranges: unknown }) => ({
        date: d.date,
        openPeriods: canonicalRangesToOpenPeriods(d.ranges),
      }),
    );
    return jsonOk({ month, days });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/public/midao/guides:availability' });
  }
}

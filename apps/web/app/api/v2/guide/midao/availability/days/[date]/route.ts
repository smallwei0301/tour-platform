/**
 * PUT /api/v2/guide/midao/availability/days/[date] — 單日時段覆寫（三格開關＋自訂時段）。
 * Auth: guide session＋CSRF。
 */
import { validateCsrf } from '../../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../../src/lib/guide-auth';
import { setDayOverrideDb, getMonthEffectiveDb } from '../../../../../../../../src/lib/midao/db-midao-availability.mjs';
import { jsonOk, jsonError } from '../../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../../src/lib/route-error';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PUT(request: Request, { params }: { params: Promise<{ date: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const { date } = await params;
  if (!DATE_RE.test(date)) return jsonError('INVALID_DATE', '日期格式需為 YYYY-MM-DD', 400);
  let body: unknown = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  try {
    await setDayOverrideDb(session.guideId, date, body as Record<string, unknown>);
    const month = date.slice(0, 7);
    const effective = (await getMonthEffectiveDb(session.guideId, month)).find((d) => d.date === date);
    return jsonOk({ date, effective });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/availability/day:put' });
  }
}

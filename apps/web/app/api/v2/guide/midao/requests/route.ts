/**
 * GET/POST /api/v2/guide/midao/requests — 需求列表／手動建單。
 * Auth: guide session；POST 需 CSRF。
 */
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import {
  listMidaoRequestsDb, createMidaoRequestDb, normalizeRequestInput,
} from '../../../../../../src/lib/db-midao-requests.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';

const STATUSES = ['all', 'new', 'pending_reply', 'replied', 'closed'];
const SORTS = ['unreplied_first', 'newest'];

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'all';
  const sort = url.searchParams.get('sort') ?? 'unreplied_first';
  if (!STATUSES.includes(status)) return jsonError('INVALID_STATUS', '狀態分頁不正確', 400);
  if (!SORTS.includes(sort)) return jsonError('INVALID_SORT', '排序方式不正確', 400);
  try {
    return jsonOk(await listMidaoRequestsDb(session.guideId, {
      status, sort: sort as 'unreplied_first' | 'newest',
    }));
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/requests:list' });
  }
}

export async function POST(request: Request) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  let body: unknown = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  const norm = normalizeRequestInput(body);
  if (!norm.ok) return jsonError(norm.code, norm.message, 400);
  try {
    const b = body as { activityId?: string; activityTitle?: string };
    const created = await createMidaoRequestDb({
      guideId: session.guideId,
      activityId: b.activityId ?? null, activityTitle: b.activityTitle ?? null,
      value: norm.value, source: 'manual',
    });
    return jsonOk({ request: created });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/requests:create' });
  }
}

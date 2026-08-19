/**
 * GET/POST /api/v2/guide/service-drafts
 * #1758 S5 · Task 26 — guide 服務草稿 revision API（把 S4 gateway 的樂觀鎖經 HTTP 暴露）。
 *
 * 白話：讓前端讀取／存檔自己名下某個 activity 的 active 服務草稿。存檔帶 expectedRevision
 * （樂觀鎖）；版本被別人推進時回 409 並帶最新版供前端重讀；問卷驗證失敗回 422 帶 errors[]；
 * 不是自己的 activity 一律 404（不洩漏「存在但不是你的」）。
 *
 * Auth：canonical guide session（HMAC cookie + runtime 檢查，沿用 Midao boundary）；POST 另需
 * CSRF 與 mutations flag。行為與其他 guide command route 一致（session → CSRF → mutations → body）。
 */
import { validateCsrf } from '../../../../../src/lib/csrf.mjs';
import {
  isMidaoBackendMutationsEnabled,
} from '../../../../../src/config/feature-flags.mjs';
import { assertActivityBelongsToGuide } from '../../../../../src/lib/assert-activity-belongs-to-guide.ts';
import { getSupabase, hasSupabaseEnv } from '../../../../../src/lib/supabase-env.mjs';
import {
  verifyCanonicalGuideSession,
  MidaoRuntimeAccessError,
} from '../../../../../src/lib/midao/canonical-guide-session.ts';
import { getServiceDraft, upsertServiceDraft } from '../../../../../src/lib/midao/db-midao-service-drafts.mjs';
import { normalizeStructuralUuid } from '../../../../../src/lib/midao/structural-uuid.mjs';
import { jsonOk, jsonError, jsonErrorWithExtras } from '../../../../../src/lib/api-response.ts';
import { reportRouteError } from '../../../../../src/lib/route-error.ts';

const ROUTE = 'v2/guide/service-drafts';


const SAFE_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Unauthorized',
  SESSION_STALE: 'Session expired',
  GUIDE_NOT_ACTIVE: 'Guide is not active',
  MIDAO_DISABLED: 'Midao backend is unavailable',
  BACKEND_MODE_MISMATCH: 'Guide backend mode conflict',
};

/** canonical session 失敗 → 對外安全錯誤（401/403/409/503）；非預期 → null（呼叫端當 500）。 */
function sessionErrorResponse(error: unknown): Response | null {
  if (error instanceof MidaoRuntimeAccessError) {
    return jsonError(error.code, SAFE_MESSAGES[error.code] ?? 'Request rejected', error.status);
  }
  return null;
}

/**
 * ownership：驗證 activityId 屬於此 guide。回 null 代表通過；否則回對外 Response。
 * 與 booking route 一致：不存在與非本人一律收斂成 404，不洩漏存在性。
 */
async function denyIfNotOwner(guideId: string, activityId: string | null): Promise<Response | null> {
  const normalizedActivityId = normalizeStructuralUuid(activityId);
  if (!normalizedActivityId) {
    return jsonError('NOT_FOUND', 'Resource not found', 404);
  }
  if (!hasSupabaseEnv()) return null; // 本地 fallback（無 Supabase）略過 ownership。
  const supabase = await getSupabase();
  const result = await assertActivityBelongsToGuide({ activityId: normalizedActivityId, guideId, supabase });
  if (!result.ok) return jsonError('NOT_FOUND', 'Resource not found', 404);
  return null;
}

/** 把 S4 gateway 的結構化結果映射成 HTTP。409 帶 currentRevision/draft；422 問卷帶 errors[]。 */
function gatewayResponse(result: {
  ok: boolean;
  conflict?: boolean;
  code?: string | null;
  status: number;
  draft?: unknown;
  currentRevision?: number | null;
  validation?: { errors?: string[] };
  publicationPreview?: unknown;
}): Response {
  if (result.ok) {
    return jsonOk({
      draft: result.draft ?? null,
      ...(result.publicationPreview !== undefined ? { publicationPreview: result.publicationPreview } : {}),
    });
  }
  if (result.conflict) {
    return jsonErrorWithExtras(
      'REVISION_CONFLICT',
      '草稿已被更新，請重新讀取最新版本',
      409,
      {
        currentRevision: result.currentRevision ?? null,
        draft: result.draft ?? null,
      },
    );
  }
  if (result.code === 'INVALID_QUESTIONNAIRE') {
    return jsonErrorWithExtras(
      'INVALID_QUESTIONNAIRE',
      '問卷題目驗證失敗',
      422,
      {
        errors: result.validation?.errors ?? [],
      },
    );
  }
  if (result.code === 'NOT_FOUND') {
    return jsonError('NOT_FOUND', 'Resource not found', 404);
  }
  return jsonError(result.code ?? 'INVALID_REQUEST', '請求參數不正確', result.status || 422);
}


export async function GET(request: Request) {
  let guideId: string;
  try {
    ({ guideId } = await verifyCanonicalGuideSession(request, { requireMode: true }));
  } catch (error) {
    const denied = sessionErrorResponse(error);
    if (denied) return denied;
    await reportRouteError(error, { route: `${ROUTE}:get` });
    return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
  }

  const activityId = new URL(request.url).searchParams.get('activityId');
  const deny = await denyIfNotOwner(guideId, activityId);
  if (deny) return deny;

  try {
    const normalizedActivityId = (activityId as string).trim();
    const result = await getServiceDraft(normalizedActivityId);
    return gatewayResponse(result);
  } catch (error) {
    await reportRouteError(error, { route: `${ROUTE}:get` });
    return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
  }
}

export async function POST(request: Request) {
  let guideId: string;
  try {
    ({ guideId } = await verifyCanonicalGuideSession(request, { requireMode: true }));
  } catch (error) {
    const denied = sessionErrorResponse(error);
    if (denied) return denied;
    await reportRouteError(error, { route: `${ROUTE}:post` });
    return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
  }

  const csrf = validateCsrf(request);
  if (csrf) {
    const body = await csrf.clone().json().catch(() => null);
    const code = String((body as { error?: { code?: unknown } })?.error?.code ?? 'CSRF_INVALID');
    const message = String((body as { error?: { message?: unknown } })?.error?.message ?? 'Invalid CSRF token');
    return jsonError(code, message, csrf.status || 403);
  }

  if (!isMidaoBackendMutationsEnabled()) {
    return jsonError('MUTATIONS_DISABLED', 'Midao mutations are unavailable', 503);
  }

  let parsed: unknown = null;
  try {
    parsed = await request.json();
  } catch {
    return jsonError('INVALID_REQUEST_BODY', 'Invalid JSON request body', 422);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return jsonError('INVALID_REQUEST_BODY', 'Invalid request body', 422);
  }
  const body = parsed as Record<string, unknown>;

  const activityId = typeof body.activityId === 'string' ? body.activityId : null;
  const deny = await denyIfNotOwner(guideId, activityId);
  if (deny) return deny;

  // patch 只帶草稿表單欄位；guideId 一律取自 session（不允許呼叫端指定擁有者）。
  const rawPatch = body.patch && typeof body.patch === 'object' && !Array.isArray(body.patch)
    ? (body.patch as Record<string, unknown>)
    : {};
  const patch: Record<string, unknown> = { ...rawPatch, guideId };

  try {
    const result = await upsertServiceDraft((activityId as string).trim(), patch, body.expectedRevision);
    return gatewayResponse(result);
  } catch (error) {
    await reportRouteError(error, { route: `${ROUTE}:post` });
    return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
  }
}

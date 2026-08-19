/**
 * DELETE /api/v2/guide/service-drafts/[draftId]
 * #1758 S5 · Task 26 — 丟棄 guide 服務草稿（呼叫 S4 discardServiceDraft，帶 expectedRevision）。
 *
 * 白話：把某活動目前的 active 服務草稿標記為 discarded；帶 expectedRevision 做樂觀鎖，
 * 版本被別人推進時回 409 帶最新版；不是自己的活動一律 404。
 *
 * ⚠️ 識別子語意（留給 Rita/Pandora 確認）：S4 gateway discardServiceDraft(activityId,
 * expectedRevision) 是「活動範疇」的——每個活動至多一筆 active 草稿，沒有 by-draft-id 的
 * 丟棄路徑（且本卡禁止改 S4）。因此本路由的 [draftId] 路徑段實際承載的是「該草稿所屬的
 * activity id」（active 草稿與其活動 1:1）。若 Pandora 原意是真正的 draft primary key 查詢，
 * 需 S4 另開 by-id 介面，屬後續 spec；本卡在既有 gateway 契約下以 activity 範疇實作。
 *
 * Auth：canonical guide session + CSRF + mutations flag（與 POST 一致）。
 */
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { isMidaoBackendMutationsEnabled } from '../../../../../../src/config/feature-flags.mjs';
import { assertActivityBelongsToGuide } from '../../../../../../src/lib/assert-activity-belongs-to-guide.ts';
import { getSupabase, hasSupabaseEnv } from '../../../../../../src/lib/supabase-env.mjs';
import {
  verifyCanonicalGuideSession,
  MidaoRuntimeAccessError,
} from '../../../../../../src/lib/midao/canonical-guide-session.ts';
import { discardServiceDraft } from '../../../../../../src/lib/midao/db-midao-service-drafts.mjs';
import { normalizeStructuralUuid } from '../../../../../../src/lib/midao/structural-uuid.mjs';
import { jsonOk, jsonError, jsonErrorWithExtras } from '../../../../../../src/lib/api-response.ts';
import { reportRouteError } from '../../../../../../src/lib/route-error.ts';

const ROUTE = 'v2/guide/service-drafts/[draftId]';

const SAFE_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Unauthorized',
  SESSION_STALE: 'Session expired',
  GUIDE_NOT_ACTIVE: 'Guide is not active',
  MIDAO_DISABLED: 'Midao backend is unavailable',
  BACKEND_MODE_MISMATCH: 'Guide backend mode conflict',
};

function sessionErrorResponse(error: unknown): Response | null {
  if (error instanceof MidaoRuntimeAccessError) {
    return jsonError(error.code, SAFE_MESSAGES[error.code] ?? 'Request rejected', error.status);
  }
  return null;
}

async function denyIfNotOwner(guideId: string, activityId: string): Promise<Response | null> {
  if (!hasSupabaseEnv()) return null; // 本地 fallback（無 Supabase）略過 ownership。
  const supabase = await getSupabase();
  const result = await assertActivityBelongsToGuide({ activityId, guideId, supabase });
  if (!result.ok) return jsonError('NOT_FOUND', 'Resource not found', 404);
  return null;
}

function gatewayResponse(result: {
  ok: boolean;
  conflict?: boolean;
  code?: string | null;
  status: number;
  draft?: unknown;
  currentRevision?: number | null;
}): Response {
  if (result.ok) return jsonOk({ draft: result.draft ?? null });
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
  if (result.code === 'NOT_FOUND') return jsonError('NOT_FOUND', 'Resource not found', 404);
  return jsonError(result.code ?? 'INVALID_REQUEST', '請求參數不正確', result.status || 422);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  let guideId: string;
  try {
    ({ guideId } = await verifyCanonicalGuideSession(request, { requireMode: true }));
  } catch (error) {
    const denied = sessionErrorResponse(error);
    if (denied) return denied;
    await reportRouteError(error, { route: ROUTE });
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

  // [draftId] 路徑段承載活動 id（見檔頭語意說明）；非 UUID 一律收斂成 404。
  const activityId = normalizeStructuralUuid((await params).draftId);
  if (!activityId) return jsonError('NOT_FOUND', 'Resource not found', 404);

  const deny = await denyIfNotOwner(guideId, activityId);
  if (deny) return deny;

  let parsed: unknown = null;
  try {
    parsed = await request.json();
  } catch {
    return jsonError('INVALID_REQUEST_BODY', 'Invalid JSON request body', 422);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return jsonError('INVALID_REQUEST_BODY', 'Invalid request body', 422);
  }
  const expectedRevision = (parsed as Record<string, unknown>).expectedRevision;

  try {
    const result = await discardServiceDraft(activityId, expectedRevision);
    return gatewayResponse(result);
  } catch (error) {
    await reportRouteError(error, { route: ROUTE });
    return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
  }
}

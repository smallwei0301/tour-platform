/**
 * POST /api/v2/guide/service-drafts/[draftId]/commands/publish
 * #1758 S7 · Task 28 — guide 服務草稿「一鍵發布」command route（把 S7 gateway 經 HTTP 暴露）。
 *
 * 白話：讓前端真的能按下「發布」按鈕。呼叫 S7 publishServiceDraft gateway（內部先跑 S3
 * 發布前驗證，再進 S6 原子 RPC），把結構化結果映射成 HTTP：
 *   - 發布成功／idempotent 重放 → 200，body 帶 publicUrl / version。
 *   - 版本衝突（REVISION_CONFLICT）→ 409，body 帶 currentRevision 供前端重讀。
 *   - slug 衝突（SLUG_COLLISION）→ 409（沿用專案既有 plan slug 衝突慣例：admin plans route
 *     的 DUPLICATE_SLUG 回 409，本 route 保持一致的 409 語意）。
 *   - 發布前驗證失敗（VALIDATION_FAILED，草稿不完整）→ 422，body 帶 errors[]。
 *   - 擁有權不符 / 找不到可發布草稿 / 找不到活動 → 404（不洩漏「存在但不是你的」）。
 *   - 內部錯誤 → 500。
 *
 * ⚠️ 識別子語意（沿用 S5 [draftId] 慣例）：S7 gateway publishServiceDraft(activityId,
 * expectedRevision, guideId) 是「活動範疇」的——每個活動至多一筆 active 草稿，沒有
 * by-draft-id 的發布路徑（且本卡禁止改 S3–S6）。因此本路由的 [draftId] 路徑段實際承載的是
 * 「該草稿所屬的 activity id」（active 草稿與其活動 1:1），與 S5 detail route 一致。
 *
 * Auth：canonical guide session + CSRF + mutations flag（與 S5 POST/DELETE 一致）。
 */
import { validateCsrf } from '../../../../../../../../src/lib/csrf.mjs';
import { isMidaoBackendMutationsEnabled } from '../../../../../../../../src/config/feature-flags.mjs';
import { assertActivityBelongsToGuide } from '../../../../../../../../src/lib/assert-activity-belongs-to-guide.ts';
import { getSupabase, hasSupabaseEnv } from '../../../../../../../../src/lib/supabase-env.mjs';
import {
  verifyCanonicalGuideSession,
  MidaoRuntimeAccessError,
} from '../../../../../../../../src/lib/midao/canonical-guide-session.ts';
import { publishServiceDraft } from '../../../../../../../../src/lib/midao/db-midao-service-publication.mjs';
import { jsonOk, jsonError } from '../../../../../../../../src/lib/api-response.ts';
import { reportRouteError } from '../../../../../../../../src/lib/route-error.ts';

const ROUTE = 'v2/guide/service-drafts/[draftId]/commands/publish';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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
 * 與 S5 route 一致：不存在與非本人一律收斂成 404，不洩漏存在性。
 */
async function denyIfNotOwner(guideId: string, activityId: string): Promise<Response | null> {
  if (!hasSupabaseEnv()) return null; // 本地 fallback（無 Supabase）略過 ownership。
  const supabase = await getSupabase();
  const result = await assertActivityBelongsToGuide({ activityId, guideId, supabase });
  if (!result.ok) return jsonError('NOT_FOUND', 'Resource not found', 404);
  return null;
}

/** 把 S7 gateway 的結構化結果映射成 HTTP。 */
function gatewayResponse(result: {
  ok: boolean;
  conflict?: boolean;
  code?: string | null;
  status: number;
  activityId?: string;
  version?: number;
  publicUrl?: string;
  idempotent?: boolean;
  currentRevision?: number | null;
  errors?: string[];
}): Response {
  if (result.ok) {
    return jsonOk({
      published: true,
      idempotent: Boolean(result.idempotent),
      activityId: result.activityId ?? null,
      version: result.version ?? null,
      publicUrl: result.publicUrl ?? null,
    });
  }
  if (result.code === 'REVISION_CONFLICT') {
    return Response.json(
      {
        success: false,
        error: { code: 'REVISION_CONFLICT', message: '草稿已被更新，請重新讀取最新版本' },
        currentRevision: result.currentRevision ?? null,
      },
      { status: 409 },
    );
  }
  if (result.code === 'SLUG_COLLISION') {
    return jsonError('SLUG_COLLISION', '方案代碼（slug）重複，請調整後再發布', 409);
  }
  if (result.code === 'VALIDATION_FAILED') {
    return Response.json(
      {
        success: false,
        error: { code: 'VALIDATION_FAILED', message: '草稿尚未符合發布條件' },
        errors: result.errors ?? [],
      },
      { status: 422 },
    );
  }
  if (
    result.code === 'OWNERSHIP_MISMATCH'
    || result.code === 'DRAFT_NOT_FOUND'
    || result.code === 'ACTIVITY_NOT_FOUND'
  ) {
    return jsonError('NOT_FOUND', 'Resource not found', 404);
  }
  return jsonError(result.code ?? 'INVALID_REQUEST', '請求參數不正確', result.status || 422);
}

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
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
  const activityId = String((await params).draftId || '').trim();
  if (!UUID_PATTERN.test(activityId)) return jsonError('NOT_FOUND', 'Resource not found', 404);

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
    // guideId 一律取自 session（不允許呼叫端指定擁有者）。
    const result = await publishServiceDraft(activityId, expectedRevision, guideId);
    return gatewayResponse(result);
  } catch (error) {
    await reportRouteError(error, { route: ROUTE });
    return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
  }
}

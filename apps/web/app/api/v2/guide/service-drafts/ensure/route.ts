import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { isMidaoBackendMutationsEnabled } from '../../../../../../src/config/feature-flags.mjs';
import { assertActivityBelongsToGuide } from '../../../../../../src/lib/assert-activity-belongs-to-guide.ts';
import { getSupabase, hasSupabaseEnv } from '../../../../../../src/lib/supabase-env.mjs';
import { MidaoRuntimeAccessError, verifyCanonicalGuideSession } from '../../../../../../src/lib/midao/canonical-guide-session.ts';
import { ensureNativeServiceDraft } from '../../../../../../src/lib/midao/db-native-service-draft-ensure.mjs';
import { normalizeStructuralUuid } from '../../../../../../src/lib/midao/structural-uuid.mjs';
import { jsonError, jsonOk } from '../../../../../../src/lib/api-response.ts';
import { reportRouteError } from '../../../../../../src/lib/route-error.ts';

const ROUTE = 'v2/guide/service-drafts/ensure';

async function ownsActivity(guideId: string, activityId: string): Promise<boolean> {
  if (!hasSupabaseEnv()) return true;
  const supabase = await getSupabase();
  return (await assertActivityBelongsToGuide({ activityId, guideId, supabase })).ok;
}

export async function POST(request: Request) {
  let guideId: string;
  try {
    ({ guideId } = await verifyCanonicalGuideSession(request, { requireMode: true }));
  } catch (error) {
    if (error instanceof MidaoRuntimeAccessError) return jsonError(error.code, 'Request rejected', error.status);
    await reportRouteError(error, { route: ROUTE });
    return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
  }
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  if (!isMidaoBackendMutationsEnabled()) return jsonError('MUTATIONS_DISABLED', 'Midao mutations are unavailable', 503);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST_BODY', 'Invalid request body', 422); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) {
    return jsonError('INVALID_REQUEST_BODY', 'Invalid request body', 422);
  }
  const activityId = normalizeStructuralUuid((body as Record<string, unknown>).activityId);
  if (!activityId) return jsonError('INVALID_ACTIVITY_ID', 'Invalid activity id', 422);
  if (!await ownsActivity(guideId, activityId)) return jsonError('NOT_FOUND', 'Resource not found', 404);
  try {
    const result = await ensureNativeServiceDraft(activityId, guideId);
    if (result.ok) return jsonOk({ draft: result.draft });
    if (result.code === 'NOT_FOUND') return jsonError('NOT_FOUND', 'Resource not found', 404);
    return jsonError(result.code ?? 'NATIVE_DRAFT_SOURCE_INVALID', '無法從既有活動建立草稿', result.status || 422);
  } catch (error) {
    await reportRouteError(error, { route: ROUTE });
    return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
  }
}

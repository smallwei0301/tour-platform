import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';
import { getServiceDraft } from './db-midao-service-drafts.mjs';
import { normalizeStructuralUuid } from './structural-uuid.mjs';

function unexpected(message = 'Midao native service draft ensure backend failure') {
  const error = new Error(message);
  error.name = 'MidaoNativeServiceDraftEnsureBackendError';
  return error;
}

export async function ensureNativeServiceDraft(activityId, guideId) {
  const normalizedActivityId = normalizeStructuralUuid(activityId);
  const normalizedGuideId = normalizeStructuralUuid(guideId);
  if (!normalizedActivityId) return { ok: false, code: 'INVALID_ACTIVITY_ID', status: 422, draft: null };
  if (!normalizedGuideId) return { ok: false, code: 'INVALID_GUIDE_ID', status: 422, draft: null };
  if (!hasSupabaseEnv()) throw unexpected('Midao native service draft ensure requires Supabase');
  const supabase = await getSupabase();
  const response = await supabase.rpc('midao_ensure_native_service_draft', {
    p_activity_id: normalizedActivityId,
    p_guide_id: normalizedGuideId,
  });
  if (response?.error) throw unexpected('Midao native service draft ensure RPC returned an error');
  const code = response?.data?.code;
  if (code === 'ACTIVITY_NOT_FOUND_OR_OWNERSHIP_MISMATCH') return { ok: false, code: 'NOT_FOUND', status: 404, draft: null };
  if (code === 'NATIVE_DRAFT_SOURCE_INVALID') return { ok: false, code, status: 422, draft: null };
  if (code !== 'CREATED' && code !== 'REUSED' && code !== 'REUSED_REPAIRED') throw unexpected('Midao native service draft ensure RPC returned an unrecognized code');
  const result = await getServiceDraft(normalizedActivityId);
  if (!result.ok || !result.draft) throw unexpected('Midao native service draft ensure did not return an active draft');
  return { ok: true, code, status: 200, draft: result.draft };
}

export const __internal = { normalizeStructuralUuid };

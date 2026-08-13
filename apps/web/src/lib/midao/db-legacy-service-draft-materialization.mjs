import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function normalizeUuid(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) return null;
  return value.trim().toLowerCase();
}

function unexpected(message = 'Midao legacy draft materialization backend failure') {
  const error = new Error(message);
  error.name = 'MidaoLegacyDraftMaterializationBackendError';
  return error;
}

function invalidResult(code) {
  return { ok: false, code, status: 422, activityId: null, draftId: null, revision: null };
}

function mapRpcResult(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw unexpected('Midao legacy draft materialization RPC returned an invalid payload');
  }
  const code = typeof data.code === 'string' ? data.code : null;
  const activityId = normalizeUuid(data.activityId);
  if (!code || !activityId) throw unexpected('Midao legacy draft materialization RPC returned invalid identifiers');

  if (code === 'CREATED' || code === 'REUSED') {
    const draftId = normalizeUuid(data.draftId);
    const revision = data.revision;
    if (!draftId || typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
      throw unexpected('Midao legacy draft materialization RPC returned an invalid draft');
    }
    return { ok: true, code, status: 200, activityId, draftId, revision };
  }

  if (code === 'ACTIVITY_NOT_FOUND_OR_OWNERSHIP_MISMATCH') {
    return {
      ok: false,
      code,
      status: data.status === 404 ? 404 : 404,
      activityId,
      draftId: null,
      revision: null,
    };
  }

  throw unexpected(`Midao legacy draft materialization RPC returned an unrecognized code: ${code}`);
}

export async function ensureLegacyServiceDraftMaterialized(activityId, guideId) {
  const normalizedActivityId = normalizeUuid(activityId);
  if (!normalizedActivityId) return invalidResult('INVALID_ACTIVITY_ID');
  const normalizedGuideId = normalizeUuid(guideId);
  if (!normalizedGuideId) return invalidResult('INVALID_GUIDE_ID');
  if (!hasSupabaseEnv()) throw unexpected('Midao legacy draft materialization requires Supabase');

  const supabase = await getSupabase();
  let response;
  try {
    response = await supabase.rpc('midao_materialize_legacy_service_draft', {
      p_activity_id: normalizedActivityId,
      p_guide_id: normalizedGuideId,
    });
  } catch {
    throw unexpected('Midao legacy draft materialization RPC call failed');
  }
  if (response?.error) throw unexpected('Midao legacy draft materialization RPC returned an error');
  return mapRpcResult(response?.data);
}

export const __internal = { normalizeUuid, mapRpcResult };

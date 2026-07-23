import { getSupabase, hasSupabaseEnv } from './supabase-env.mjs';

export class MidaoBackendModeDbError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'MidaoBackendModeDbError';
    this.code = code;
    this.status = status;
  }
}

function mapRpcError(error) {
  const message = String(error?.message || '');
  if (message.includes('IDEMPOTENCY_KEY_REUSED')) {
    return new MidaoBackendModeDbError('IDEMPOTENCY_CONFLICT', 'Idempotency key conflicts with another request', 409);
  }
  if (message.includes('IDEMPOTENCY_IN_PROGRESS')) {
    return new MidaoBackendModeDbError('IDEMPOTENCY_IN_PROGRESS', 'Request is already processing', 409);
  }
  if (message.includes('GUIDE_NOT_FOUND')) return new MidaoBackendModeDbError('GUIDE_NOT_FOUND', 'Guide not found', 404);
  if (message.includes('GUIDE_NOT_ACTIVE')) return new MidaoBackendModeDbError('GUIDE_NOT_ACTIVE', 'Guide is not active', 403);
  if (message.includes('INVALID_') || message.includes('_REQUIRED')) {
    return new MidaoBackendModeDbError('INVALID_MODE_SWITCH_REQUEST', 'Invalid mode switch request', 422);
  }
  return new MidaoBackendModeDbError('MODE_SWITCH_FAILED', 'Unable to switch backend mode', 500);
}

function validateResponse(data) {
  if (!data || typeof data !== 'object'
    || !['legacy', 'midao'].includes(data.backendMode)
    || !Number.isSafeInteger(data.sessionVersion) || data.sessionVersion < 1
    || typeof data.changed !== 'boolean'
    || !['/midao', '/guide/dashboard'].includes(data.redirectTo)) {
    throw new MidaoBackendModeDbError('INVALID_MODE_SWITCH_RESPONSE', 'Invalid mode switch response', 500);
  }
  return {
    backendMode: data.backendMode,
    sessionVersion: data.sessionVersion,
    changed: data.changed,
    redirectTo: data.redirectTo,
  };
}

/**
 * Read current canonical direction, enforce forward-only gates, then invoke the
 * single atomic RPC. Rollback and same-mode replays never depend on flags.
 * @param {{ guideId:string, targetMode:'legacy'|'midao', reason:string, actorId:string,
 * requestId:string, idempotencyKey:string, requestHash:string, backendEnabled:boolean,
 * modeSwitchEnabled:boolean, client?:any }} input
 */
export async function switchGuideBackendModeDb(input) {
  let client = input.client;
  if (!client) {
    if (!hasSupabaseEnv()) throw new MidaoBackendModeDbError('DATABASE_UNAVAILABLE', 'Database unavailable', 503);
    client = getSupabase();
  }

  const { data: guide, error: guideError } = await client
    .from('guide_profiles')
    .select('id, backend_mode')
    .eq('id', input.guideId)
    .maybeSingle();
  if (guideError) throw new MidaoBackendModeDbError('DATABASE_ERROR', 'Unable to read guide mode', 500);
  if (!guide) throw new MidaoBackendModeDbError('GUIDE_NOT_FOUND', 'Guide not found', 404);
  if (!['legacy', 'midao'].includes(guide.backend_mode)) {
    throw new MidaoBackendModeDbError('INVALID_GUIDE_MODE', 'Guide mode is invalid', 500);
  }

  const isForward = guide.backend_mode === 'legacy' && input.targetMode === 'midao';
  if (isForward && (!input.backendEnabled || !input.modeSwitchEnabled)) {
    throw new MidaoBackendModeDbError('MIDAO_MODE_SWITCH_DISABLED', 'Midao mode switch is unavailable', 503);
  }

  const { data, error } = await client.rpc('midao_switch_guide_backend_mode', {
    p_guide_id: input.guideId,
    p_target_mode: input.targetMode,
    p_reason: input.reason,
    p_actor_type: 'admin',
    p_actor_id: input.actorId,
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
  });
  if (error) throw mapRpcError(error);
  return validateResponse(data);
}

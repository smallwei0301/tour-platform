import { hasSupabaseEnv, getSupabase } from '../supabase-env.mjs';

const GUIDE_RUNTIME_PROJECTION = 'id, display_name, backend_mode, guide_session_version, verification_status';

/**
 * Read the canonical runtime fields required by the Midao route boundary.
 * An optional client is accepted only as a deterministic test seam.
 * @param {{ guideId: string, client?: any }} input
 */
export async function getGuideRuntimeAccessDb({ guideId, client = null }) {
  const normalizedGuideId = String(guideId || '').trim();
  if (!normalizedGuideId) throw new Error('guideId is required');
  if (!client) {
    if (!hasSupabaseEnv()) throw new Error('MIDAO_RUNTIME_DB_UNAVAILABLE');
    client = await getSupabase();
  }

  const { data, error } = await client
    .from('guide_profiles')
    .select(GUIDE_RUNTIME_PROJECTION)
    .eq('id', normalizedGuideId)
    .single();

  if (error || !data) {
    if (error?.code === 'PGRST116' || !data) return null;
    throw new Error('MIDAO_RUNTIME_DB_ERROR');
  }

  return {
    guideId: String(data.id),
    displayName: String(data.display_name || ''),
    backendMode: String(data.backend_mode || 'legacy'),
    guideSessionVersion: Number(data.guide_session_version ?? 1),
    verificationStatus: String(data.verification_status || ''),
  };
}

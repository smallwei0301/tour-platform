const PROFILE_RICH_SELECT = 'id, display_name, slug, verification_status, headline, region, rating_avg, guide_email, profile_photo_url, bio, specialties, backend_mode, created_at';
const PROFILE_BASE_SELECT = 'id, display_name, slug, verification_status, headline, region, rating_avg, guide_email, profile_photo_url, backend_mode, created_at';
const PROFILE_LEGACY_SELECT = 'id, display_name, slug, verification_status, headline, region, rating_avg, guide_email, profile_photo_url, created_at';

function isMissingColumn(error) {
  return error?.code === '42703';
}

async function queryProfile(client, guideId, columns) {
  return client
    .from('guide_profiles')
    .select(columns)
    .eq('id', guideId)
    .maybeSingle();
}

/**
 * Admin dual-entity resolution must only fall through to applications when the profile
 * lookup completed successfully with no row. Schema-drift fallbacks are restricted to
 * PostgreSQL missing-column errors; every other database error propagates fail closed.
 */
export async function getAdminGuideProfileDb(client, guideId) {
  const selects = [PROFILE_RICH_SELECT, PROFILE_BASE_SELECT, PROFILE_LEGACY_SELECT];
  for (let index = 0; index < selects.length; index += 1) {
    const { data, error } = await queryProfile(client, guideId, selects[index]);
    if (!error) return data ?? null;
    if (index < selects.length - 1 && isMissingColumn(error)) continue;
    throw error;
  }
  throw new Error('unreachable guide profile fallback state');
}

export const __internal = {
  PROFILE_RICH_SELECT,
  PROFILE_BASE_SELECT,
  PROFILE_LEGACY_SELECT,
  isMissingColumn,
};

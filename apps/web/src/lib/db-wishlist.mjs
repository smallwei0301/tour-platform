/**
 * 願望清單（Issue #305）
 * #1613 db.mjs strangler：整塊自 db.mjs 純搬移（行為零變更；型別債見 #1597）。
 * db.mjs 以 re-export 保持既有 caller 匯入路徑不變。
 */
import { getSupabase } from './supabase-env.mjs';

// ---------------------------------------------------------------------------
// Issue #305: Wishlist helpers
// ---------------------------------------------------------------------------

const UUID_V4_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolve wishlist activity input to canonical activities.id (uuid).
 * Accepts either a uuid id or a slug.
 * @param {import('@supabase/supabase-js').SupabaseClient<any, 'public', any>} supabase
 * @param {string} activityRef
 * @returns {Promise<string>}
 */
async function resolveWishlistActivityId(supabase, activityRef) {
  const normalizedRef = String(activityRef || '').trim();
  if (!normalizedRef) throw new Error('activityId is required');

  if (UUID_V4_LIKE_RE.test(normalizedRef)) {
    return normalizedRef;
  }

  const { data: activity, error } = await supabase
    .from('activities')
    .select('id')
    .eq('slug', normalizedRef)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!activity?.id) throw new Error('activity not found');
  return String(activity.id);
}

/**
 * Add an activity to the user's wishlist.
 * Silently upserts to handle duplicate clicks gracefully.
 * @param {{ userId: string, activityId: string }} input
 * @returns {Promise<{ id: string, userId: string, activityId: string, addedAt: string }>}
 */
export async function addToWishlistDb(input) {
  const userId = String(input?.userId || '').trim();
  const activityRef = String(input?.activityId || '').trim();

  if (!userId) throw new Error('userId is required');
  if (!activityRef) throw new Error('activityId is required');

  const supabase = await getSupabase();
  const resolvedActivityId = await resolveWishlistActivityId(supabase, activityRef);

  const { data, error } = await supabase
    .from('wishlists')
    .upsert({ user_id: userId, activity_id: resolvedActivityId }, { onConflict: 'user_id,activity_id' })
    .select('id, user_id, activity_id, added_at')
    .single();

  if (error) throw new Error(error.message);
  return {
    id: data.id,
    userId: data.user_id,
    activityId: data.activity_id,
    addedAt: data.added_at,
  };
}

/**
 * Remove an activity from the user's wishlist.
 * @param {{ userId: string, activityId: string }} input
 * @returns {Promise<void>}
 */
export async function removeFromWishlistDb(input) {
  const userId = String(input?.userId || '').trim();
  const activityId = String(input?.activityId || '').trim();

  if (!userId) throw new Error('userId is required');
  if (!activityId) throw new Error('activityId is required');

  const supabase = await getSupabase();
  const { error } = await supabase
    .from('wishlists')
    .delete()
    .eq('user_id', userId)
    .eq('activity_id', activityId);

  if (error) throw new Error(error.message);
}

/**
 * List all wishlisted activities for a user, with activity details.
 * @param {{ userId: string }} input
 * @returns {Promise<Array<{ id: string, activityId: string, addedAt: string, title: string, slug: string, priceTwd: number }>>}
 */
export async function listWishlistDb(input) {
  const userId = String(input?.userId || '').trim();
  if (!userId) throw new Error('userId is required');

  const supabase = await getSupabase();

  // NOTE (Issue #431): avoid PostgREST embed dependency on
  // wishlists.activity_id -> activities.id relationship metadata.
  // Some production environments may have drifted schema/FK definitions,
  // which breaks embeds with PGRST200/PGRST201.
  const { data: rows, error } = await supabase
    .from('wishlists')
    .select('id, activity_id, added_at')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (error) throw new Error(error.message);

  const activityRefs = [...new Set((rows || []).map((r) => String(r.activity_id || '').trim()).filter(Boolean))];
  // Accept any canonical UUID shape (not only RFC4122 v1-v5) because legacy production
  // rows may contain non-standard variant/version UUID-looking ids.
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const activityIds = activityRefs.filter((ref) => uuidLike.test(ref));
  const activitySlugs = activityRefs.filter((ref) => !uuidLike.test(ref));

  let activityByIdMap = new Map();
  let activityBySlugMap = new Map();

  // Safe: getSupabase() uses service-role key, which bypasses activities RLS
  // (status='published' filter does not apply here).
  if (activityIds.length > 0) {
    const { data: activitiesById, error: activityByIdError } = await supabase
      .from('activities')
      .select('id, title, slug, price_twd, cover_image_url, region, region_slug')
      .in('id', activityIds);

    if (activityByIdError) throw new Error(activityByIdError.message);
    activityByIdMap = new Map((activitiesById || []).map((a) => [a.id, a]));
  }

  if (activitySlugs.length > 0) {
    const { data: activitiesBySlug, error: activityBySlugError } = await supabase
      .from('activities')
      .select('id, title, slug, price_twd, cover_image_url, region, region_slug')
      .in('slug', activitySlugs);

    if (activityBySlugError) throw new Error(activityBySlugError.message);
    activityBySlugMap = new Map((activitiesBySlug || []).map((a) => [a.slug, a]));
  }

  return (rows || []).map((row) => {
    const activityRef = String(row.activity_id || '').trim();
    const activity = activityByIdMap.get(activityRef) || activityBySlugMap.get(activityRef);
    return {
      id: row.id,
      activityId: row.activity_id,
      addedAt: row.added_at,
      title: activity?.title || '',
      slug: activity?.slug || '',
      priceTwd: activity?.price_twd || 0,
      coverImageUrl: activity?.cover_image_url || null,
      // region/regionSlug 供 UI 組 canonical 詳情頁連結 /activities/<region>/<slug>
      // （少了 region 會經 [region] 相容頁多一次查詢 + 轉址，點擊載入過久）。
      region: activity?.region || null,
      regionSlug: activity?.region_slug || null,
    };
  });
}


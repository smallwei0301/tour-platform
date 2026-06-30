/**
 * 純查詢：依 activityId 取出公開頁失效所需的 { region, regionSlug, slug }。
 *
 * 刻意不 import `next/cache`（與 region-slug.mjs 同樣的「可單測純邏輯」分層），
 * 讓本檔可在 node --test 直接 import 驗證查詢 shape；實際 revalidatePath 由
 * revalidate-activity-by-id.mjs 串接。
 *
 * region_slug 必須回原欄位值（正規化後的英文 slug），下游才打得到被快取的詳情頁
 * 路徑（#1440）。best-effort：查不到或出錯一律回 null，呼叫端不應因此中斷寫入。
 *
 * @param {{ from: Function }} supabase
 * @param {string} activityId
 * @returns {Promise<{ region: string|null, regionSlug: string|null, slug: string }|null>}
 */
export async function loadActivityRevalidateTarget(supabase, activityId) {
  try {
    const { data } = await supabase
      .from('activities')
      .select('slug, region, region_slug')
      .eq('id', activityId)
      .single();

    if (data?.slug) {
      return { region: data.region ?? null, regionSlug: data.region_slug ?? null, slug: data.slug };
    }
  } catch {
    // best-effort
  }
  return null;
}

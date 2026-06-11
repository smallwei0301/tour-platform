/**
 * Issue #1382 — 最近瀏覽與活動頁推薦的純邏輯。
 * localStorage 存取由元件層包 try/catch（無痕模式 fail-safe），這裡只管資料運算。
 */

export const RECENTLY_VIEWED_STORAGE_KEY = 'tp_recently_viewed';
export const RECENTLY_VIEWED_CAP = 10;

/**
 * 新瀏覽項目放最前、同 slug 去重、超出上限丟尾端。
 * @param {Array<{slug: string}>|unknown} list
 * @param {{slug?: string, [key: string]: unknown}} item
 * @param {number} cap
 */
export function pushRecentlyViewed(list, item, cap = RECENTLY_VIEWED_CAP) {
  const safeList = Array.isArray(list) ? list : [];
  if (!item || !item.slug) return safeList;
  const deduped = safeList.filter((x) => x && x.slug !== item.slug);
  return [item, ...deduped].slice(0, cap);
}

/**
 * 從活動清單挑「同地區」與「同類型」推薦，排除當前活動。
 * @param {Array<{slug: string, region?: string, category?: string}>} activities
 * @param {{currentSlug: string, region?: string, category?: string, limit?: number}} opts
 */
export function pickRecommendations(activities, { currentSlug, region, category, limit = 4 }) {
  const pool = (Array.isArray(activities) ? activities : []).filter(
    (a) => a && a.slug && a.slug !== currentSlug
  );
  return {
    sameRegion: region ? pool.filter((a) => a.region === region).slice(0, limit) : [],
    sameCategory: category ? pool.filter((a) => a.category === category).slice(0, limit) : [],
  };
}

// 行程詳情頁 URL 的「地區 slug」單一真相來源（single source of truth）。
//
// 詳情頁路由是 `/activities/[region]/[slug]`，其中 `[region]` 一律是「正規化過的
// 英文 slug」（例如「高雄市」→ `kaohsiung`），由 `buildActivityHref()`
// （`activity-url.ts`）與 db 的 `buildCanonicalActivityDetailPath()` 產生連結。
//
// 過去這份地區→slug 對照表在 `activity-url.ts`、`db.mjs`、`revalidate-activity.mjs`
// 各有一份；只要其中一份漏掉正規化，admin 改完呼叫 `revalidatePath()` 的路徑就會
// 與實際被快取的詳情頁路徑對不上（raw 中文地區 vs 正規化 slug），導致 ISR 永遠
// 失效不到那一頁、前台看不到輪播照片／暖場評論照片的變更。為杜絕此類 drift，
// 統一由本模組提供正規化邏輯。

const REGION_SLUG_MAP = {
  '台北市': 'taipei',
  '台北': 'taipei',
  '新北市': 'new-taipei',
  '桃園市': 'taoyuan',
  '台中市': 'taichung',
  '台南市': 'tainan',
  '高雄市': 'kaohsiung',
  '高雄': 'kaohsiung',
  '花蓮縣': 'hualien',
  '花蓮': 'hualien',
};

/**
 * 把「地區名稱」正規化成詳情頁 URL 用的英文 slug。
 * 對照表命中優先；否則退回 ASCII 化；全空則 `taiwan`。
 * @param {string | null | undefined} region
 * @returns {string}
 */
export function normalizeRegionForActivityPath(region) {
  if (!region || typeof region !== 'string') return 'taiwan';
  const regionTrimmed = region.trim();
  if (!regionTrimmed) return 'taiwan';

  const mapped = REGION_SLUG_MAP[regionTrimmed];
  if (mapped) return mapped;

  const asciiSlug = regionTrimmed
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return asciiSlug || 'taiwan';
}

/**
 * 決定詳情頁 URL 用的地區 segment：已存的 `regionSlug` 欄位優先（與建立連結時
 * 一致），否則由 raw `region` 正規化。回傳值與 `buildActivityHref()`／
 * `buildCanonicalActivityDetailPath()` 完全一致，確保 revalidate 路徑命中快取。
 * @param {{ region?: string | null, regionSlug?: string | null }} activity
 * @returns {string}
 */
export function resolveActivityRegionSegment(activity = {}) {
  const regionSlug = typeof activity?.regionSlug === 'string' ? activity.regionSlug.trim() : '';
  if (regionSlug) return regionSlug;
  return normalizeRegionForActivityPath(activity?.region);
}

/**
 * 計算某行程編輯/刪除/上下架後，需要 on-demand 失效的 ISR 路徑清單（純函式，好測）。
 *
 * 詳情頁與地區列表頁的 `[region]` segment 一律是「正規化過的英文 slug」，與
 * `buildActivityHref()`／`buildCanonicalActivityDetailPath()` 建出的連結一致。
 * revalidatePath 必須用同一套路徑，否則打不到實際被快取的詳情頁（#1440 根因）。
 *
 * 本函式不依賴 `next/cache`，方便在 node test 直接驗證路徑正確性。
 * @param {{ region?: string|null, regionSlug?: string|null, slug?: string|null }} activity
 * @returns {string[]} 去重後的路徑清單
 */
export function activityRevalidationPaths(activity = {}) {
  const slug = activity?.slug ? String(activity.slug).trim() : '';
  const regionSegment = resolveActivityRegionSegment(activity);

  // '/'（首頁）：首頁精選大卡與自動行程清單來自已發布行程目錄，行程上下架／
  // 編輯後需一併失效，配合首頁長 revalidate（on-demand 為主）讓變更即時反映。
  const paths = ['/', '/activities'];
  if (regionSegment) {
    paths.push(`/activities/${regionSegment}`);
    if (slug) paths.push(`/activities/${regionSegment}/${slug}`);
  }
  return [...new Set(paths)];
}

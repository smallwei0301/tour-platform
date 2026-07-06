// @ts-check
/**
 * Issue #1592 — 評分分佈（純函式，5-4-3-2-1 長條用）。
 *
 * 低成本高信任感：把一批評論算成各星等筆數＋百分比＋平均，供活動頁評論區頭部長條。
 * 不碰 DB／不需 migration；資料來源＝已載入的評論陣列（rating 欄位）。
 */

/**
 * @param {Array<{ rating?: number | string | null }>} reviews
 * @returns {{
 *   total: number,
 *   avg: number,
 *   counts: Record<1|2|3|4|5, number>,
 *   percents: Record<1|2|3|4|5, number>
 * }}
 */
export function buildRatingDistribution(reviews) {
  const list = Array.isArray(reviews) ? reviews : [];
  /** @type {Record<1|2|3|4|5, number>} */
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let total = 0;

  for (const r of list) {
    const n = Math.round(Number(r?.rating));
    if (!Number.isFinite(n) || n < 1 || n > 5) continue;
    counts[/** @type {1|2|3|4|5} */ (n)] += 1;
    sum += n;
    total += 1;
  }

  /** @type {Record<1|2|3|4|5, number>} */
  const percents = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (total > 0) {
    for (const star of [1, 2, 3, 4, 5]) {
      const s = /** @type {1|2|3|4|5} */ (star);
      // 四捨五入到整數百分比（總和可能因四捨五入非恰 100，UI 僅作長條寬度用）
      percents[s] = Math.round((counts[s] / total) * 100);
    }
  }

  const avg = total > 0 ? Number((sum / total).toFixed(1)) : 0;
  return { total, avg, counts, percents };
}

/**
 * Issue #1592 補強 — 合併「已核准正式評論」與「暖場社群口碑語錄」成單一顯示列，
 * 讓評分分佈與星等/照片篩選同時涵蓋兩者（管理者後台設定的暖場評論即進入正式評論邏輯）。
 * 真實評論在前、暖場在後；每筆帶 `isWarm` 旗標供渲染分流（暖場無日期/導遊回覆）。
 * 只影響活動頁「評論面板」的視覺分佈/篩選；rating_avg／review_count／JSON-LD 仍由
 * page 層另計、僅用真實評論（#1378 SEO 紅線，暖場不得污染結構化資料）。
 * @param {Array<any>} reviews 已核准正式評論（{ id, rating, photos, guideReply, ... }）
 * @param {Array<{ author?: unknown, rating?: number, text?: string, photos?: unknown }>} warmQuotes 已 normalizeSocialProofQuotes
 * @returns {Array<any>} 合併後顯示列，每筆含 isWarm 旗標
 */
export function toReviewDisplayList(reviews, warmQuotes) {
  const real = (Array.isArray(reviews) ? reviews : []).map((r) => ({ ...r, isWarm: false }));
  const warm = (Array.isArray(warmQuotes) ? warmQuotes : []).map((q, i) => ({
    id: `warm-${i}`,
    isWarm: true,
    author: q?.author,
    rating: q?.rating,
    text: q?.text,
    photos: Array.isArray(q?.photos) ? q.photos : [],
  }));
  return [...real, ...warm];
}

/**
 * Issue #1592 — 評論篩選（純函式）：依星等與「只看含照片」過濾。
 * 不碰 DB；供活動頁評論區 `?rating=`／`?withPhotos=` 前端或 SSR 套用。
 *
 * @param {Array<{ rating?: number | string | null, photos?: unknown }>} reviews
 * @param {{ rating?: number | string | null, withPhotos?: boolean }} [filters]
 * @returns {Array<any>}
 */
export function filterReviews(reviews, filters = {}) {
  const list = Array.isArray(reviews) ? reviews : [];
  const wantRating = Math.round(Number(filters?.rating));
  const hasRatingFilter = Number.isFinite(wantRating) && wantRating >= 1 && wantRating <= 5;
  const wantPhotos = filters?.withPhotos === true;

  return list.filter((r) => {
    if (hasRatingFilter && Math.round(Number(r?.rating)) !== wantRating) return false;
    if (wantPhotos) {
      const photos = /** @type {any} */ (r)?.photos;
      if (!Array.isArray(photos) || photos.length === 0) return false;
    }
    return true;
  });
}

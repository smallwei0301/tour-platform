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

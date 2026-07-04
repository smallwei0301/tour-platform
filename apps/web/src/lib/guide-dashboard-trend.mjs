/**
 * issue1605 — guide dashboard 營收趨勢的台北時區月鍵分組純函式。
 * 6 個月趨勢由「逐月查詢」改為「單一區間查詢＋記憶體分組」，
 * 月鍵語意須與原本逐月 [mStart, mEnd) 半開區間（台北 UTC+8 月界）完全等價。
 */

const TAIPEI_OFFSET_MINUTES = 8 * 60;

/**
 * 把 timestamp 換算成台北時區的月鍵（例：'2026-06'）。
 * 以 timestamp 加 8 小時後取 UTC 年月，等價於台北日曆月。
 * @param {string} createdAt - ISO timestamp（支援 Z 與 +00:00 格式）
 * @returns {string} 'YYYY-MM'
 */
export function taipeiMonthKey(createdAt) {
  const shifted = new Date(new Date(createdAt).getTime() + TAIPEI_OFFSET_MINUTES * 60000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * 把訂單按台北月鍵分桶（保留原陣列順序）。
 * @param {Array<{created_at: string}>|null|undefined} orders
 * @returns {Map<string, Array<object>>}
 */
export function groupOrdersByTaipeiMonth(orders) {
  const byMonth = new Map();
  for (const order of orders ?? []) {
    const key = taipeiMonthKey(order.created_at);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(order);
    else byMonth.set(key, [order]);
  }
  return byMonth;
}

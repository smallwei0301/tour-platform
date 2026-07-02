/**
 * Issue #1557 — 活動列表排序純函式（健檢 v2 P1-6）。
 *
 * 與卡片/詳情頁顯示的星數同源：rating 排序用 resolveActivityReviewStats
 * 的 score（真實評論 + 口碑語錄），同分再依評論數 count 多到少。
 * recommended 維持原始（伺服器/推薦）順序。一律回傳新陣列、不 mutate 輸入。
 */
import { resolveActivityReviewStats } from './activity-review-stats.mjs';

export function sortActivities(activities, sortKey) {
  const list = Array.isArray(activities) ? [...activities] : [];
  switch (sortKey) {
    case 'price-asc':
      return list.sort((a, b) => (a.priceTwd ?? 0) - (b.priceTwd ?? 0));
    case 'price-desc':
      return list.sort((a, b) => (b.priceTwd ?? 0) - (a.priceTwd ?? 0));
    case 'rating': {
      // 預先算好統計，避免比較器內重複計算
      const stats = new Map(list.map((a) => [a, resolveActivityReviewStats(a)]));
      return list.sort((a, b) => {
        const sa = stats.get(a);
        const sb = stats.get(b);
        if (sb.score !== sa.score) return sb.score - sa.score;
        return sb.count - sa.count;
      });
    }
    case 'recommended':
    default:
      return list;
  }
}

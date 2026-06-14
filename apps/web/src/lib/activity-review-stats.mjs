// 行程評價統計（單一實作，首頁精選卡與行程詳情頁共用）。
// count = 真實評論數 + 自設口碑語錄數（兩者皆以卡片呈現，故一併計入）。
// score = 行程平均評分（ratingAvg）優先；無則由「真實評論 + 口碑語錄星數」平均；再無則 5.0。
import { normalizeSocialProofQuotes } from './social-proof-quotes.mjs';

export function resolveActivityReviewStats(activity = {}) {
  const reviews = Array.isArray(activity.reviews) ? activity.reviews : [];
  const quotes = normalizeSocialProofQuotes(activity.socialProofQuotes);
  const count = reviews.length + quotes.length;

  let score;
  if (typeof activity.ratingAvg === 'number' && activity.ratingAvg > 0) {
    score = activity.ratingAvg;
  } else {
    // 口碑語錄現可各自設定星數，與真實評論星數一併計入平均
    const ratings = [
      ...reviews.map((r) => Number(r.rating)),
      ...quotes.map((q) => Number(q.rating)),
    ].filter((n) => Number.isFinite(n) && n > 0);
    score = ratings.length > 0 ? ratings.reduce((s, n) => s + n, 0) / ratings.length : 5.0;
  }
  // 夾在 0–5，保留一位小數
  score = Math.max(0, Math.min(5, score));
  return { score: Number(score.toFixed(1)), count };
}

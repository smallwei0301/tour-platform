// 行程評價統計（單一實作，首頁精選卡與行程詳情頁共用）。
// count = 真實評論數 + 自設暖場留言數（兩者皆以卡片呈現，故一併計入）。
// score = 行程平均評分（ratingAvg）優先；無則由真實評論平均；再無則 5.0。
export function resolveActivityReviewStats(activity = {}) {
  const reviews = Array.isArray(activity.reviews) ? activity.reviews : [];
  const warmQuotes = Array.isArray(activity.socialProofQuotes) ? activity.socialProofQuotes : [];
  const count = reviews.length + warmQuotes.length;

  let score;
  if (typeof activity.ratingAvg === 'number' && activity.ratingAvg > 0) {
    score = activity.ratingAvg;
  } else if (reviews.length > 0) {
    const sum = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0);
    score = sum / reviews.length;
  } else {
    score = 5.0;
  }
  // 夾在 0–5，保留一位小數
  score = Math.max(0, Math.min(5, score));
  return { score: Number(score.toFixed(1)), count };
}

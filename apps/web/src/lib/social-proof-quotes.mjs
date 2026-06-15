// 社群口碑語錄（暖場評論）的單一正規化實作。
//
// 歷史資料相容：social_proof_quotes 早期只存純文字字串陣列
// （例：["超值！","導遊很專業"]）。本模組把「字串」與「結構化物件」
// （{ author, rating, text }）統一正規化成 { author, rating, text }，
// 讓前台、後台、評分統計、JSON-LD 都吃同一種形狀。
//
// 設計重點：
// - author 留空時保留 ''（前台顯示再 fallback 為「旅客回饋」），
//   使舊資料（純文字）維持原本「旅客回饋」的顯示。
// - rating 夾在 1–5 並四捨五入；非數字預設 5。
// - text 去除前後空白；空白者視為無效（過濾掉）。

export const SOCIAL_PROOF_DEFAULT_AUTHOR = '旅客回饋';

/**
 * 將單筆口碑語錄（字串或物件）正規化為 { author, rating, text }。
 * 無有效文字時回傳 null（由 normalizeSocialProofQuotes 過濾）。
 * @param {unknown} item
 * @returns {{ author: string, rating: number, text: string, photos: string[] } | null}
 */
export function normalizeSocialProofQuote(item) {
  if (item == null) return null;

  if (typeof item === 'string') {
    const text = item.trim();
    if (!text) return null;
    return { author: '', rating: 5, text, photos: [] };
  }

  if (typeof item === 'object') {
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!text) return null;
    const author = typeof item.author === 'string' ? item.author.trim() : '';
    let rating = Number(item.rating);
    if (!Number.isFinite(rating)) rating = 5;
    rating = Math.min(5, Math.max(1, Math.round(rating)));
    // 暖場評論照片（選填，最多 5 張）：只保留字串 URL。
    const photos = Array.isArray(item.photos)
      ? item.photos.filter((u) => typeof u === 'string' && u.trim()).slice(0, 5)
      : [];
    return { author, rating, text, photos };
  }

  return null;
}

/**
 * 正規化整個口碑語錄陣列；過濾無效（空文字）項目。
 * @param {unknown} quotes
 * @returns {Array<{ author: string, rating: number, text: string, photos: string[] }>}
 */
export function normalizeSocialProofQuotes(quotes) {
  if (!Array.isArray(quotes)) return [];
  return quotes.map(normalizeSocialProofQuote).filter(Boolean);
}

/**
 * 前台顯示用：人名留空時 fallback 為「旅客回饋」。
 * @param {unknown} author
 * @returns {string}
 */
export function resolveSocialProofAuthor(author) {
  const a = typeof author === 'string' ? author.trim() : '';
  return a || SOCIAL_PROOF_DEFAULT_AUTHOR;
}

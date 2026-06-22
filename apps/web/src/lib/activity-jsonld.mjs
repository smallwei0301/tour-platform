/**
 * Issue #1378 — 活動詳情頁 Product JSON-LD 與 OG image helpers。
 *
 * .mjs（node --test 可直接 import）；頁面以 JSON.stringify 注入
 * <script type="application/ld+json">，與既有 TouristAttraction/FAQPage 並列。
 */

/**
 * 與 generateMetadata 既有預設 OG 圖一致的 fallback。
 * 分享縮圖（IG／私訊／FB 連結預覽）一律走站內 og-default 圖；
 * 此常數需為絕對 URL（部分爬蟲不解析 metadataBase，JSON-LD 亦需絕對路徑）。
 */
export const DEFAULT_ACTIVITY_OG_IMAGE = `${
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app'
}/images/og-default.png`;

/**
 * @param {string | null | undefined} coverImageUrl
 * @returns {string} 活動封面；無封面時 fallback 預設圖
 */
export function resolveActivityOgImage(coverImageUrl) {
  return coverImageUrl || DEFAULT_ACTIVITY_OG_IMAGE;
}

/**
 * JSON-LD 安全序列化：JSON.stringify 不會跳脫 `</script>`，
 * 直接注入 dangerouslySetInnerHTML 會讓含 `</script>` 的字串提早閉合
 * script 標籤。把 `<` 轉成 `\\u003c`（JSON 等價、瀏覽器 JSON.parse 結果不變）。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function serialiseJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * 產生 Product JSON-LD（含 Offer；有真實評論才輸出 aggregateRating，
 * 避免空評分違反 Google 結構化資料規範）。
 *
 * @param {{
 *   slug: string,
 *   region?: string,
 *   regionSlug?: string,
 *   title: string,
 *   shortDescription?: string | null,
 *   coverImageUrl?: string | null,
 *   priceTwd: number,
 *   ratingAvg?: number | null,
 *   reviewCount?: number | null,
 * }} activity
 * @param {string} appUrl 站台 base URL（無尾斜線）
 */
export function buildActivityProductJsonLd(activity, appUrl) {
  const regionSegment = activity.regionSlug || activity.region || '';
  const url = `${appUrl}/activities/${regionSegment}/${activity.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: activity.title,
    description: activity.shortDescription || activity.title,
    url,
    brand: { '@type': 'Brand', name: 'Midao 祕島' },
    offers: {
      '@type': 'Offer',
      price: String(activity.priceTwd),
      priceCurrency: 'TWD',
      availability: 'https://schema.org/InStock',
      url,
    },
  };

  if (activity.coverImageUrl) {
    jsonLd.image = [activity.coverImageUrl];
  }

  const reviewCount = Number(activity.reviewCount ?? 0);
  if (activity.ratingAvg != null && reviewCount > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: activity.ratingAvg,
      reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return jsonLd;
}

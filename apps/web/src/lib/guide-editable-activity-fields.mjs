/**
 * 導遊在共用行程編輯器可改的「內容欄位」白名單（camelCase，與編輯表單／DTO 同 shape）。
 *
 * 刻意排除（安全 / 範圍）：
 *   - status               上架只能經審核核准，導遊不可自助上下架（計劃邊角案例 #3）
 *   - guideSlug / guideId  避免導遊把行程改歸屬到別人
 *   - ratingAvg / reviewCount  由系統依真實已核准評論自動對齊（#1378）
 *   - plans                Phase 1 方案（含每方案價格）仍由管理者管（計劃邊角案例 #7）
 *   - minParticipants / maxParticipants  活動層級已停用、遷到方案層（#297）
 */
export const GUIDE_EDITABLE_ACTIVITY_FIELDS = [
  'title',
  'tagline',
  'shortDescription',
  'description',
  'region',
  'regionSlug',
  'category',
  'priceTwd',
  'durationMinutes',
  'meetingPoint',
  'meetingPointMapUrl',
  'coverImageUrl',
  'imageUrls',
  'inclusions',
  'exclusions',
  'notices',
  'refundRules',
  'safetyNotice',
  'goodFor',
  'notGoodFor',
  'transportMode',
  'seoTitle',
  'seoDescription',
  'faq',
  'itinerary',
  'socialProofQuotes',
];

/**
 * 從任意輸入挑出白名單欄位，丟棄其餘（含危險的 status/guideSlug 等）。
 * @param {Record<string, any>} input
 * @returns {Record<string, any>}
 */
export function pickGuideEditableFields(input = {}) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of GUIDE_EDITABLE_ACTIVITY_FIELDS) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

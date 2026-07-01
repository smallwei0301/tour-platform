// 五大行程主題（單一事實來源）— footer、活動列表「行程主題」篩選、各主題介紹頁
// 都從這裡取得，確保標籤、slug、關鍵字一致（#mobile-categories）。
//
// 每個主題的 keywords 同時涵蓋：英文 DB category（outdoor/culture/food）、
// 中文 category 顯示標籤（戶外冒險／文化歷史／美食體驗…）與標題／標語常見字眼，
// 因為列表的 category 來源混用（seed 為英文、部分真實資料為中文）。比對採
// 「任一關鍵字命中 category／title／tagline／shortDescription」即視為符合。

import { normalizeActivityTypeForFilter } from './activity-type-filter.mjs';
import { resolveExplicitCategorySlug } from './category-tags.mjs';

export const ACTIVITY_THEMES = [
  {
    label: '柴山探洞',
    slug: 'cave-exploration',
    keywords: ['柴山', '探洞', '洞穴', 'cave'],
  },
  {
    label: '野外溪流',
    slug: 'river-trekking',
    keywords: ['溯溪', '野溪', '溪流', '溪谷', '野外', 'river'],
  },
  {
    label: '文化歷史',
    slug: 'culture-history',
    keywords: ['文化', '歷史', '老街', '古蹟', '街區', '部落', '原住民', 'culture'],
  },
  {
    label: '自然生態',
    slug: 'ecology',
    keywords: ['生態', '自然', '賞鳥', '潮間帶', '濕地', '夜觀', 'nature', 'ecology'],
  },
  {
    label: '山野秘境',
    slug: 'mountain-wilderness',
    keywords: ['登山', '健行', '山徑', '步道', '森林', '秘境', '縱走', '百岳'],
  },
];

/** 主題標籤清單（活動列表「行程主題」篩選用）。 */
export const ACTIVITY_THEME_LABELS = ACTIVITY_THEMES.map((t) => t.label);

// 五大主題各自歸屬的四大分類（單一事實來源同 category-tags.mjs）。用於「明確
// 分類優先」：一個行程若有明確 category，只允許同分類家族的主題命中，不讓文案
// 關鍵字把它漏進其他分類的主題（對齊行程卡 badge 的判定）。mountain 家族含
// 柴山探洞與山野秘境兩主題，家族內仍靠關鍵字區分。
const THEME_SLUG_TO_CATEGORY = {
  'cave-exploration': 'mountain',
  'river-trekking': 'river',
  'culture-history': 'culture',
  ecology: 'ecology',
  'mountain-wilderness': 'mountain',
};

/** 由標籤取得主題定義（容忍 emoji／空白／編碼差異）。 */
export function getThemeByLabel(label) {
  const normalized = normalizeActivityTypeForFilter(label);
  if (!normalized) return undefined;
  return ACTIVITY_THEMES.find((t) => normalizeActivityTypeForFilter(t.label) === normalized);
}

/** 活動是否屬於指定主題：任一關鍵字命中 category／title／tagline／shortDescription。 */
export function isActivityInTheme(activity, themeLabel) {
  const theme = getThemeByLabel(themeLabel);
  if (!theme || !activity) return false;

  // 明確分類優先：activity 有 canonical category 時，僅允許同分類家族的主題命中，
  // 阻擋文案關鍵字把行程漏配到其他分類的主題（例：明選山徑卻因文案含生態字眼而
  // 出現在「自然生態」）。同家族內（柴山探洞／山野秘境）仍由下方關鍵字區分。
  const explicitSlug = resolveExplicitCategorySlug(activity.category);
  if (explicitSlug && THEME_SLUG_TO_CATEGORY[theme.slug] !== explicitSlug) return false;

  const haystack = [activity.category, activity.title, activity.tagline, activity.shortDescription]
    .map((value) => normalizeActivityTypeForFilter(value))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return false;

  return theme.keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

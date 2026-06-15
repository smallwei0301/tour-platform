// 五大行程主題（單一事實來源）— footer、活動列表「行程主題」篩選、各主題介紹頁
// 都從這裡取得，確保標籤、slug、關鍵字一致（#mobile-categories）。
//
// 每個主題的 keywords 同時涵蓋：英文 DB category（outdoor/culture/food）、
// 中文 category 顯示標籤（戶外冒險／文化歷史／美食體驗…）與標題／標語常見字眼，
// 因為列表的 category 來源混用（seed 為英文、部分真實資料為中文）。比對採
// 「任一關鍵字命中 category／title／tagline／shortDescription」即視為符合。

import { normalizeActivityTypeForFilter } from './activity-type-filter.mjs';

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
    label: '美食導覽',
    slug: 'food-tour',
    keywords: ['美食', '夜市', '小吃', '導覽', 'food'],
  },
  {
    label: '山野秘境',
    slug: 'mountain-wilderness',
    keywords: ['登山', '健行', '山徑', '步道', '森林', '秘境', '縱走', '百岳'],
  },
];

/** 主題標籤清單（活動列表「行程主題」篩選用）。 */
export const ACTIVITY_THEME_LABELS = ACTIVITY_THEMES.map((t) => t.label);

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

  const haystack = [activity.category, activity.title, activity.tagline, activity.shortDescription]
    .map((value) => normalizeActivityTypeForFilter(value))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return false;

  return theme.keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

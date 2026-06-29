// 四大行程分類（單一事實來源）— 首頁主題 tile、行程卡片 badge、後台分類下拉
// 都對齊這四類。badge 以 classifyActivityCategoryTag() 由既有資料自動歸類，
// 不需逐筆改 DB；legacy 的英文 category 值（outdoor/culture/food/nature）與
// 中文標籤都編進 keywords，舊資料自動對應：
//   outdoor→mountain、culture→culture、food→culture、nature→ecology。
//
// 比對手法沿用 activity-themes.mjs：normalize 後「任一關鍵字命中
// category／title／tagline／shortDescription」即視為符合。

import { normalizeActivityTypeForFilter } from './activity-type-filter.mjs';

export const CATEGORY_TAGS = [
  {
    slug: 'mountain',
    keywords: [
      '登山', '健行', '山徑', '步道', '森林', '秘境', '縱走', '百岳',
      '柴山', '探洞', '洞穴', '戶外', '戶外冒險', '戶外探索',
      'outdoor', 'mountain', 'cave', 'hiking',
    ],
  },
  {
    slug: 'river',
    keywords: ['溯溪', '野溪', '溪流', '溪谷', '野外', 'river'],
  },
  {
    slug: 'culture',
    keywords: [
      '文化', '歷史', '老街', '古蹟', '街區', '部落', '原住民',
      '美食', '夜市', '小吃', '導覽',
      '文化歷史', '文化體驗', '美食體驗', '美食饗宴',
      'culture', 'food',
    ],
  },
  {
    slug: 'ecology',
    keywords: [
      '生態', '自然', '自然生態', '賞鳥', '賞蝶', '賞螢', '潮間帶',
      '濕地', '珊瑚', '動物', '植物', '海洋', '夜觀', '國家公園',
      'nature', 'ecology', 'wildlife',
    ],
  },
];

/** 四大分類顯示順序（首頁 tile／後台下拉）。 */
export const CATEGORY_TAG_SLUGS = CATEGORY_TAGS.map((t) => t.slug);

/** badge／下拉用中文短標籤（FeaturedTours 等未 i18n 的純中文元件直接取用）。 */
export const CATEGORY_TAG_LABELS_ZH = {
  mountain: '山徑',
  river: '野溪',
  culture: '文化',
  ecology: '生態',
};

// 歸類優先序：river／ecology 比 mountain／culture 更具識別度，先判定以免
// 被 mountain 的 'outdoor' 或 culture 的泛用關鍵字先搶走。無命中時 fallback
// 'culture'（都市／美食／導覽類最合適的 catch-all）。
const CLASSIFY_PRIORITY = ['river', 'ecology', 'mountain', 'culture'];
const DEFAULT_TAG = 'culture';

/**
 * 把行程歸到四大分類之一，回傳 slug。
 * @param {{ category?: string, title?: string, tagline?: string, shortDescription?: string } | null | undefined} activity
 * @returns {'mountain'|'river'|'culture'|'ecology'}
 */
export function classifyActivityCategoryTag(activity) {
  if (!activity) return DEFAULT_TAG;

  const haystack = [activity.category, activity.title, activity.tagline, activity.shortDescription]
    .map((value) => normalizeActivityTypeForFilter(value))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return DEFAULT_TAG;

  for (const slug of CLASSIFY_PRIORITY) {
    const tag = CATEGORY_TAGS.find((t) => t.slug === slug);
    if (tag.keywords.some((kw) => haystack.includes(kw.toLowerCase()))) return slug;
  }
  return DEFAULT_TAG;
}

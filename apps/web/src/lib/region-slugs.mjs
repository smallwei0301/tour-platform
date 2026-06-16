const REGION_REGISTRY = Object.freeze({
  taipei: { slug: 'taipei', displayName: '台北', dbValue: '台北市' },
  'new-taipei': { slug: 'new-taipei', displayName: '新北', dbValue: '新北市' },
  taoyuan: { slug: 'taoyuan', displayName: '桃園', dbValue: '桃園市' },
  taichung: { slug: 'taichung', displayName: '台中', dbValue: '台中市' },
  tainan: { slug: 'tainan', displayName: '台南', dbValue: '台南市' },
  kaohsiung: { slug: 'kaohsiung', displayName: '高雄', dbValue: '高雄市' },
  keelung: { slug: 'keelung', displayName: '基隆', dbValue: '基隆市' },
  hsinchu: { slug: 'hsinchu', displayName: '新竹', dbValue: '新竹市' },
  hualien: { slug: 'hualien', displayName: '花蓮', dbValue: '花蓮縣' },
  taitung: { slug: 'taitung', displayName: '台東', dbValue: '台東縣' },
  nantou: { slug: 'nantou', displayName: '南投', dbValue: '南投縣' },
  yilan: { slug: 'yilan', displayName: '宜蘭', dbValue: '宜蘭縣' },
  pingtung: { slug: 'pingtung', displayName: '屏東', dbValue: '屏東縣' },
  miaoli: { slug: 'miaoli', displayName: '苗栗', dbValue: '苗栗縣' },
  chiayi: { slug: 'chiayi', displayName: '嘉義', dbValue: '嘉義縣' },
  penghu: { slug: 'penghu', displayName: '澎湖', dbValue: '澎湖縣' },
  kinmen: { slug: 'kinmen', displayName: '金門', dbValue: '金門縣' },
  matsu: { slug: 'matsu', displayName: '馬祖', dbValue: '連江縣' },
});

// 反查表：把任意形式的地區值（英文 slug／中文短名 displayName／DB 全名 dbValue）
// 都對應回「DB 規範值」（含「市／縣」後綴的全名，例如 '高雄市'）。
// footer／熱門目的地等連結用短名（'高雄'），但 DB／admin 表單存的是全名（'高雄市'），
// 過去地區篩選用字串精確比對 → '高雄' !== '高雄市' → 永遠 0 筆。統一經由本表正規化。
const DB_VALUE_BY_ALIAS = Object.freeze(
  Object.values(REGION_REGISTRY).reduce((map, entry) => {
    map[entry.slug] = entry.dbValue;
    map[entry.displayName] = entry.dbValue;
    map[entry.dbValue] = entry.dbValue;
    return map;
  }, Object.create(null)),
);

/**
 * 把任意形式的地區值正規化成「DB 規範值」（含「市／縣」後綴的中文全名）。
 * 命中 registry（slug／短名／全名皆可）→ 回傳對應 dbValue；
 * 未知值原樣 trim 回傳（不丟棄外部輸入）；空值／非字串回傳 ''。
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeRegionToDbValue(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return DB_VALUE_BY_ALIAS[trimmed] ?? trimmed;
}

export function getRegionBySlug(slug) {
  if (typeof slug !== 'string' || slug.length === 0) return null;
  return REGION_REGISTRY[slug] ?? null;
}

export function isKnownRegionSlug(slug) {
  return getRegionBySlug(slug) !== null;
}

/** 下拉選單用：回傳 [{ slug, displayName }]（依 registry 順序）。 */
export function listRegionOptions() {
  return Object.values(REGION_REGISTRY).map(({ slug, displayName }) => ({ slug, displayName }));
}

export { REGION_REGISTRY };

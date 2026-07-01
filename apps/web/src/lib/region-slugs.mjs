// 全台縣市「唯一真實來源」（single source of truth）。
//
// 兩層模型：
//  1) REGION_REGISTRY —— 22 個「現行」縣市（縣市合併後的新名稱；沒有高雄縣，只有
//     高雄市）。每個 division 一筆，供「建檔用」下拉（admin／guide 活動編輯、投稿）
//     以「全名 dbValue」呈現與儲存，並提供詳情頁 URL slug。
//  2) SEARCH_REGIONS —— 前台「搜尋/分類」用的短名群組（footer／首頁／側欄）。短名
//     只作搜尋；點「嘉義」要同時搜到嘉義市＋嘉義縣、「新竹」搜新竹市＋新竹縣（兩者
//     今日仍是獨立縣市）。其餘短名各對應單一現行縣市。
//
// 既有 slug 是 URL segment 與已存 region_slug，維持穩定：chiayi=嘉義縣、
// hsinchu=新竹市 不動；嘉義市／新竹縣以新 slug（chiayi-city／hsinchu-county）加入。

const REGION_REGISTRY = Object.freeze({
  taipei: { slug: 'taipei', displayName: '台北', dbValue: '台北市' },
  'new-taipei': { slug: 'new-taipei', displayName: '新北', dbValue: '新北市' },
  taoyuan: { slug: 'taoyuan', displayName: '桃園', dbValue: '桃園市' },
  taichung: { slug: 'taichung', displayName: '台中', dbValue: '台中市' },
  tainan: { slug: 'tainan', displayName: '台南', dbValue: '台南市' },
  kaohsiung: { slug: 'kaohsiung', displayName: '高雄', dbValue: '高雄市' },
  keelung: { slug: 'keelung', displayName: '基隆', dbValue: '基隆市' },
  hsinchu: { slug: 'hsinchu', displayName: '新竹', dbValue: '新竹市' },
  'hsinchu-county': { slug: 'hsinchu-county', displayName: '新竹縣', dbValue: '新竹縣' },
  miaoli: { slug: 'miaoli', displayName: '苗栗', dbValue: '苗栗縣' },
  changhua: { slug: 'changhua', displayName: '彰化', dbValue: '彰化縣' },
  nantou: { slug: 'nantou', displayName: '南投', dbValue: '南投縣' },
  yunlin: { slug: 'yunlin', displayName: '雲林', dbValue: '雲林縣' },
  chiayi: { slug: 'chiayi', displayName: '嘉義', dbValue: '嘉義縣' },
  'chiayi-city': { slug: 'chiayi-city', displayName: '嘉義市', dbValue: '嘉義市' },
  hualien: { slug: 'hualien', displayName: '花蓮', dbValue: '花蓮縣' },
  taitung: { slug: 'taitung', displayName: '台東', dbValue: '台東縣' },
  yilan: { slug: 'yilan', displayName: '宜蘭', dbValue: '宜蘭縣' },
  pingtung: { slug: 'pingtung', displayName: '屏東', dbValue: '屏東縣' },
  penghu: { slug: 'penghu', displayName: '澎湖', dbValue: '澎湖縣' },
  kinmen: { slug: 'kinmen', displayName: '金門', dbValue: '金門縣' },
  matsu: { slug: 'matsu', displayName: '馬祖', dbValue: '連江縣' },
});

// 前台搜尋短名群組。key 沿用主要 slug；label 為短名（搜尋分類用）；dbValues 為
// 該短名應涵蓋的「現行」全名集合（只有嘉義／新竹是雙值，其餘單值；無任何舊縣名）。
const SEARCH_REGIONS = Object.freeze([
  { key: 'taipei', label: '台北', dbValues: ['台北市'] },
  { key: 'new-taipei', label: '新北', dbValues: ['新北市'] },
  { key: 'taoyuan', label: '桃園', dbValues: ['桃園市'] },
  { key: 'taichung', label: '台中', dbValues: ['台中市'] },
  { key: 'tainan', label: '台南', dbValues: ['台南市'] },
  { key: 'kaohsiung', label: '高雄', dbValues: ['高雄市'] },
  { key: 'keelung', label: '基隆', dbValues: ['基隆市'] },
  { key: 'hsinchu', label: '新竹', dbValues: ['新竹市', '新竹縣'] },
  { key: 'miaoli', label: '苗栗', dbValues: ['苗栗縣'] },
  { key: 'changhua', label: '彰化', dbValues: ['彰化縣'] },
  { key: 'nantou', label: '南投', dbValues: ['南投縣'] },
  { key: 'yunlin', label: '雲林', dbValues: ['雲林縣'] },
  { key: 'chiayi', label: '嘉義', dbValues: ['嘉義市', '嘉義縣'] },
  { key: 'pingtung', label: '屏東', dbValues: ['屏東縣'] },
  { key: 'yilan', label: '宜蘭', dbValues: ['宜蘭縣'] },
  { key: 'hualien', label: '花蓮', dbValues: ['花蓮縣'] },
  { key: 'taitung', label: '台東', dbValues: ['台東縣'] },
  { key: 'penghu', label: '澎湖', dbValues: ['澎湖縣'] },
  { key: 'kinmen', label: '金門', dbValues: ['金門縣'] },
  { key: 'matsu', label: '馬祖', dbValues: ['連江縣'] },
]);

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

// 短名（label）→ 展開後的 dbValue 集合。只有雙名短名（嘉義／新竹）會展開成多個；
// 其餘短名展開成單一現行縣市。刻意「只以 label 為 key」——全名（嘉義市）與 slug
// （chiayi）不進本表，故用全名／slug 篩選時維持「specific 單一 division」語意
// （詳情頁 /activities/chiayi 仍只顯示嘉義縣，不會混入嘉義市）。
const DBVALUES_BY_SEARCH_LABEL = Object.freeze(
  SEARCH_REGIONS.reduce((map, group) => {
    map[group.label] = group.dbValues;
    return map;
  }, Object.create(null)),
);

// 任意輸入（key／label／dbValue／slug／displayName）→ 該搜尋群組的穩定 label（給
// 前台 UI state／URL 高亮用）。找不到回 ''。
const SEARCH_LABEL_BY_INPUT = Object.freeze(
  (() => {
    const map = Object.create(null);
    for (const group of SEARCH_REGIONS) {
      map[group.key] = group.label;
      map[group.label] = group.label;
      for (const dbValue of group.dbValues) map[dbValue] = group.label;
    }
    // registry 的 slug／短名／全名也對應回所屬群組 label
    for (const entry of Object.values(REGION_REGISTRY)) {
      const label = map[entry.dbValue];
      if (label) {
        map[entry.slug] = label;
        map[entry.displayName] = label;
      }
    }
    return map;
  })(),
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

/**
 * 把「搜尋輸入」展開成要比對的 DB 規範值集合。
 * - 短名 label（'嘉義'／'新竹'）→ 群組所有現行 division（['嘉義市','嘉義縣']）。
 * - 其餘（全名／slug／單值短名）→ 單一正規化值（specific）。
 * - 未知非空值 → [normalizeRegionToDbValue(value)]（不丟棄外部輸入）。空 → []。
 * @param {unknown} value
 * @returns {string[]}
 */
export function expandRegionToDbValues(value) {
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  const group = DBVALUES_BY_SEARCH_LABEL[trimmed];
  if (group) return [...group];
  const single = normalizeRegionToDbValue(trimmed);
  return single ? [single] : [];
}

/**
 * 把任意輸入對應回其搜尋群組的穩定 label（前台 UI state／URL 用）。找不到回 ''。
 * @param {unknown} value
 * @returns {string}
 */
export function resolveSearchRegionKey(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return SEARCH_LABEL_BY_INPUT[trimmed] ?? '';
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

/**
 * 建檔用（admin／guide 活動編輯下拉）：全 22 個現行 division。
 * 消費者以「全名 dbValue」呈現與儲存（可區分嘉義市／嘉義縣）。
 * @returns {Array<{slug:string, displayName:string, dbValue:string}>}
 */
export function listAllDivisions() {
  return Object.values(REGION_REGISTRY).map(({ slug, displayName, dbValue }) => ({
    slug,
    displayName,
    dbValue,
  }));
}

/**
 * 前台搜尋/分類用：短名群組清單（footer／首頁／側欄）。
 * @returns {Array<{key:string, label:string, dbValues:string[]}>}
 */
export function listSearchRegions() {
  return SEARCH_REGIONS.map(({ key, label, dbValues }) => ({ key, label, dbValues: [...dbValues] }));
}

export { REGION_REGISTRY, SEARCH_REGIONS };

// 行程「地點」支援全台縣市與複選的純函式工具（單一真實來源）。
//
// 背景（使用者需求）：行程編輯的地點選擇需要可選擇全台灣縣市，並可複選。
// 資料模型上，活動仍保留單一「主要地區」（`region` / `region_slug`）決定
// 詳情頁 URL `/activities/[region]/[slug]`、canonical 與 SEO；複選的其他縣市
// 存進 `activities.regions`（jsonb 陣列），讓行程在多個地區的篩選中都會出現，
// 而不需改動既有的單一 URL 結構（最小破壞面）。
//
// 本檔只放純邏輯（正規化、去重、比對），方便用 node --test 直接驗證，
// 不依賴 Supabase。db.mjs 與前端表單共用同一套正規化避免 drift。

import { normalizeRegionToDbValue, expandRegionToDbValues } from './region-slugs.mjs';

/**
 * 把「附加地區（複選）」正規化成乾淨、可持久化的 DB 規範值陣列：
 *   - 每個值經 `normalizeRegionToDbValue`（'高雄'/'kaohsiung' → '高雄市'）
 *   - 去除空值與重複
 *   - 排除與主要地區相同者（主要地區已存在 `region` 欄位，不重複存）
 *
 * @param {unknown} additionalRegions 任意形式的地區陣列（slug／短名／全名皆可）
 * @param {unknown} [primaryRegion] 主要地區（任意形式），會被正規化後排除
 * @returns {string[]} 正規化後的附加地區 DB 規範值（依輸入順序、去重）
 */
export function normalizeAdditionalRegions(additionalRegions, primaryRegion = '') {
  const primary = normalizeRegionToDbValue(primaryRegion);
  const list = Array.isArray(additionalRegions) ? additionalRegions : [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const value = normalizeRegionToDbValue(raw);
    if (!value) continue;
    if (value === primary) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * 行程「涵蓋的所有地區」DB 規範值集合（主要地區 + 附加地區），已正規化去重。
 * 供前台地區篩選的命中判斷使用。
 * @param {{ region?: unknown, regions?: unknown }} activity
 * @returns {string[]}
 */
export function activityRegionDbValues(activity = {}) {
  const primary = normalizeRegionToDbValue(activity?.region);
  const extras = normalizeAdditionalRegions(activity?.regions, primary);
  return primary ? [primary, ...extras] : extras;
}

/**
 * 判斷某行程是否命中指定地區（主要或附加皆算命中）。
 * 兩端都會正規化，'高雄' / 'kaohsiung' / '高雄市' 視為同一地區。
 * 搜尋短名會展開成多個現行縣市：'嘉義' 命中嘉義市或嘉義縣、'新竹' 命中新竹市或
 * 新竹縣（見 expandRegionToDbValues）；其餘短名/全名維持單一 division。
 * @param {{ region?: unknown, regions?: unknown }} activity
 * @param {unknown} wantRegion 任意形式的目標地區
 * @returns {boolean}
 */
export function activityMatchesRegion(activity, wantRegion) {
  const wants = expandRegionToDbValues(wantRegion);
  if (wants.length === 0) return true;
  const have = new Set(activityRegionDbValues(activity));
  return wants.some((w) => have.has(w));
}

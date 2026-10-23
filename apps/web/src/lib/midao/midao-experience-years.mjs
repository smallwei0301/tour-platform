// @ts-check
/**
 * 導覽經驗年資的嚴格解析（server 的 updateGuideExperienceYearsDb 與 midao2/me 頁面共用同一份規則）。
 * 只接受：整數 number，或 1–2 位純數字字串（不 trim、不收空字串／正負號／小數／指數／空白）；範圍 0–60。
 * @param {unknown} raw
 * @returns {number|null} 合法年資，否則 null
 */
export function parseExperienceYears(raw) {
  const n = typeof raw === 'number' ? raw : (typeof raw === 'string' && /^\d{1,2}$/.test(raw) ? Number(raw) : NaN);
  return Number.isInteger(n) && n >= 0 && n <= 60 ? n : null;
}

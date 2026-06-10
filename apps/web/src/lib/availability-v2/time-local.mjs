/**
 * 時段規則「本地時間」正規化（guide / admin availability rules 共用）。
 *
 * 為什麼需要：guide_availability_rules.start_time_local /
 * end_time_local 是 Postgres `time` 欄位，讀回來一律帶秒（"09:00:00"）。
 * 但 <input type="time">（預設 step=60）與寫入 route 的舊驗證只認 HH:MM，
 * 於是「讀出既有規則 → 原值送回儲存」會被自家 API 以
 * 「Invalid start_time_local」打回。這支 pure helper 把 H:MM / HH:MM /
 * HH:MM:SS 一律收斂成正規的 HH:MM（24 小時制，捨棄秒），非法輸入回 null。
 *
 * Pure helper：無 I/O、無 logging。route 負責查詢與回應；本檔只負責
 * 「把各種時間字串收斂成單一 HH:MM 形狀」這個契約。
 */

/**
 * @param {unknown} value
 * @returns {string | null} 正規化後的 "HH:MM"；無法解析時為 null。
 */
export function normalizeTimeLocal(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);

  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidTimeLocal(value) {
  return normalizeTimeLocal(value) !== null;
}

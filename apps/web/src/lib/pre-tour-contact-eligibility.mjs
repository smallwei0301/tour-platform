// @ts-check
/**
 * Issue #1596 — 行前導遊聯絡資格判定（純函式）。
 *
 * 規則：訂單為 confirmed，且「現在」落在 [出發前 24h, 活動結束] 區間內，才可對旅客顯示
 * 導遊聯絡方式。是否「同意揭露」由 route 另行檢查 guides.contact_phone_visible。
 *
 * 純函式收所有時間為參數，方便單測（不讀時鐘）。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {{ status?: string, scheduleStartAt?: string | null, scheduleEndAt?: string | null, now?: string }} input
 * @returns {boolean}
 */
export function canShowGuideContact({ status, scheduleStartAt, scheduleEndAt, now } = {}) {
  if (status !== 'confirmed') return false;

  const start = Date.parse(String(scheduleStartAt ?? ''));
  const t = Date.parse(String(now ?? ''));
  if (!Number.isFinite(start) || !Number.isFinite(t)) return false;

  const endParsed = Date.parse(String(scheduleEndAt ?? ''));
  // 無 end 時以 start + 24h 當保守結束（行程當日仍可聯絡）
  const end = Number.isFinite(endParsed) ? endParsed : start + DAY_MS;

  const windowStart = start - DAY_MS;
  return t >= windowStart && t <= end;
}

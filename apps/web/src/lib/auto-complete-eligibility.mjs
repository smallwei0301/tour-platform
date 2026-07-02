/**
 * Issue #1554 — 訂單自動完成資格判斷（純函式，可脫離 Supabase 單測）。
 *
 * 背景（健檢 v2 P0-1）：completed 推進原本純人工，settlement sweep 只結算
 * completed → 沒人按完成就永遠卡 confirmed、結算/評論漏單。
 *
 * 政策：
 * - 只動 `confirmed`；refund_pending / reschedule_requested 等一律不碰
 *   （狀態機在退款/改期申請時已把訂單移出 confirmed，此處為雙重保險）。
 * - 時間基準＝出團開始時間（V2 booking.start_at 優先、legacy schedule.start_at
 *   fallback，與 settlement 的 pickEffectiveStartAt 同源邏輯）＋寬限期。
 *   寬限期預設 48h：涵蓋跨夜行程與導遊回報時差，掃碼核銷（未來）可提前完成。
 * - 無時間來源 → 不自動完成（不誤傷），改列入停滯告警。
 */

export const AUTO_COMPLETE_DEFAULT_GRACE_HOURS = 48;

/** 停滯告警門檻＝寬限期 × 此倍數（超過仍卡 confirmed 且無法自動完成 → 通知營運）。 */
export const STALLED_GRACE_MULTIPLIER = 2;

/**
 * @param {object} input
 * @param {string} input.status 訂單狀態
 * @param {string|null} input.effectiveStartAt 出團開始時間（ISO；booking 優先、schedule fallback）
 * @param {string} input.nowIso 掃描基準時間
 * @param {number} [input.graceHours] 寬限期（小時）
 * @returns {{ eligible: boolean, reason: 'eligible'|'not_confirmed'|'no_time_source'|'within_grace' }}
 */
export function evaluateAutoCompleteEligibility({
  status,
  effectiveStartAt,
  nowIso,
  graceHours = AUTO_COMPLETE_DEFAULT_GRACE_HOURS,
} = {}) {
  if (status !== 'confirmed') return { eligible: false, reason: 'not_confirmed' };

  const start = Date.parse(effectiveStartAt || '');
  if (!Number.isFinite(start)) return { eligible: false, reason: 'no_time_source' };

  const now = Date.parse(nowIso || '');
  const cutoff = now - graceHours * 3600_000;
  if (start > cutoff) return { eligible: false, reason: 'within_grace' };

  return { eligible: true, reason: 'eligible' };
}

/**
 * 停滯判斷：confirmed 且「無法被自動完成消化」（無時間來源）且建立已久，
 * 或（保險）出團時間已超過寬限期×2 仍是 confirmed——正常情況 sweep 會在
 * 寬限期後立即消化，能撐過兩倍寬限期代表 sweep 或資料有異常。
 */
export function isStalledConfirmedOrder({
  status,
  effectiveStartAt,
  createdAt,
  nowIso,
  graceHours = AUTO_COMPLETE_DEFAULT_GRACE_HOURS,
} = {}) {
  if (status !== 'confirmed') return false;
  const now = Date.parse(nowIso || '');
  if (!Number.isFinite(now)) return false;

  const stalledCutoff = now - graceHours * STALLED_GRACE_MULTIPLIER * 3600_000;

  const start = Date.parse(effectiveStartAt || '');
  if (Number.isFinite(start)) return start <= stalledCutoff;

  // 無時間來源：以建立時間衡量（老單卡 confirmed 又沒有出團時間 → 資料異常，需人看）
  const created = Date.parse(createdAt || '');
  return Number.isFinite(created) && created <= stalledCutoff;
}

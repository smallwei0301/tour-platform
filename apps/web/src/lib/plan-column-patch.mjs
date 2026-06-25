/**
 * 把（已過白名單的）方案編輯欄位轉成 activity_plans DB 欄位 patch（純函式，離線可測）。
 *
 * 關鍵正確性：只套用 input 中「實際出現」的欄位（部分更新），避免把未提供的 rich 欄位
 * 寫成 null —— 否則核准時會把方案既有的 inclusions/itinerary 等內容清空（#1376 類 bug）。
 */
import { normalizeRichPlanPayload } from './activity-plans-rich-mapper.mjs';

export const PLAIN_PLAN_COLUMNS = [
  'name', 'description', 'duration_minutes', 'price_type', 'base_price',
  'min_participants', 'max_participants', 'booking_type', 'is_year_round',
];

export const RICH_PLAN_COLUMNS = [
  'details_link_text', 'booking_btn_text', 'highlights', 'language',
  'earliest_departure', 'confirm_by_days', 'free_cancel_days',
  'plan_inclusions', 'plan_exclusions', 'plan_itinerary', 'plan_itinerary_image_url',
  'meeting_point_name', 'meeting_address', 'experience_point_name', 'experience_address',
  'plan_notices', 'plan_refund_rules',
];

export function buildPlanColumnPatch(editable = {}) {
  const patch = {};
  if (!editable || typeof editable !== 'object') return patch;
  for (const col of PLAIN_PLAN_COLUMNS) {
    if (editable[col] !== undefined) {
      patch[col] = col === 'name' ? String(editable[col]).trim() : editable[col];
    }
  }
  const rich = normalizeRichPlanPayload(editable);
  for (const col of RICH_PLAN_COLUMNS) {
    if (editable[col] !== undefined) patch[col] = rich[col];
  }
  return patch;
}

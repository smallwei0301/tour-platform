/**
 * 導遊在「方案編輯器」可改的欄位白名單（snake_case，與 activity_plans 欄位／
 * v2 admin plan route body 同 shape）。Phase 2：方案（含每方案價格）開放給導遊
 * 自助編輯／新建，一律走送審（pending overlay），核准才套用上架。
 *
 * 刻意排除（安全 / 範圍）：
 *   - status                上架／下架只能經審核流程；導遊不可自助把方案改成 active/archived
 *   - slug                  由系統 generatePlanSlug 產生，避免撞鍵或被導遊竄改路由
 *   - activity_id / id      歸屬與主鍵不可由 payload 改
 *   - legacy_plan_id        遷移用，導遊不該碰
 *   - review_state / pending_* / review_admin_note  審核狀態欄位由 gateway 管，不可挾帶
 *   - created_at / updated_at  時間戳由 DB／gateway 管
 */
export const GUIDE_EDITABLE_PLAN_FIELDS = [
  // 基本與定價
  'name',
  'description',
  'duration_minutes',
  'price_type',
  'base_price',
  'min_participants',
  'max_participants',
  'booking_type',
  'is_year_round',
  // 顯示與規則（rich fields）
  'details_link_text',
  'booking_btn_text',
  'highlights',
  'language',
  'earliest_departure',
  'confirm_by_days',
  'free_cancel_days',
  'plan_inclusions',
  'plan_exclusions',
  'plan_itinerary',
  'plan_itinerary_image_url',
  'meeting_point_name',
  'meeting_address',
  'experience_point_name',
  'experience_address',
  'plan_notices',
  'plan_refund_rules',
];

/**
 * 從任意輸入挑出方案白名單欄位，丟棄其餘（含危險的 status/slug/activity_id 等）。
 * @param {Record<string, any>} input
 * @returns {Record<string, any>}
 */
export function pickGuideEditablePlanFields(input = {}) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of GUIDE_EDITABLE_PLAN_FIELDS) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

/**
 * 建立新方案時的最小必填驗證（對齊 v2 admin plan route 的 create 規則）。
 * 回傳 { ok: true } 或 { ok: false, message }。
 * @param {Record<string, any>} input
 */
export function validateGuidePlanCreate(input = {}) {
  if (!input || typeof input !== 'object') return { ok: false, message: 'invalid body' };
  if (!input.name || String(input.name).trim().length === 0) {
    return { ok: false, message: '方案名稱必填' };
  }
  const duration = Number(input.duration_minutes);
  if (!Number.isFinite(duration) || duration < 15) {
    return { ok: false, message: '方案時長至少 15 分鐘' };
  }
  if (input.price_type !== 'per_person' && input.price_type !== 'per_group') {
    return { ok: false, message: '計價方式須為每人或每團' };
  }
  const basePrice = Number(input.base_price);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    return { ok: false, message: '價格須為 0 或正整數' };
  }
  const minP = input.min_participants == null ? 1 : Number(input.min_participants);
  const maxP = input.max_participants == null ? 10 : Number(input.max_participants);
  if (!Number.isFinite(minP) || minP < 1 || !Number.isFinite(maxP) || maxP < minP) {
    return { ok: false, message: '人數區間不合法（最少 ≥1 且最多 ≥最少）' };
  }
  if (input.booking_type !== undefined &&
      !['scheduled', 'request', 'instant'].includes(input.booking_type)) {
    return { ok: false, message: '預約方式不合法' };
  }
  return { ok: true };
}

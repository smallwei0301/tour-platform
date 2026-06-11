/**
 * Issue #1383 — 訂單改期純邏輯（政策時限、資格、目標 slot、逾時失效）。
 * 設計：docs/04-tech/04-tech-architecture/13-order-reschedule-design.md
 * owner 定案（2026-06-11）：每訂單限改 1 次、guide 72h lazy-expire。
 * 申請窗：行程開始前 48h（refundRules 為展示文字非機器可讀，v1 以常數實作）。
 */

export const RESCHEDULE_WINDOW_HOURS = 48;
export const RESCHEDULE_EXPIRE_HOURS = 72;
export const RESCHEDULE_MAX_PER_ORDER = 1;

const ELIGIBLE_ORDER_STATUSES = new Set(['paid', 'confirmed']);

/**
 * @returns {{ ok: true } | { ok: false, status: number, code: string, message: string }}
 */
export function canRequestReschedule({ orderStatus, scheduleStartAt, now, approvedCount = 0, hasPendingRequest = false }) {
  if (!ELIGIBLE_ORDER_STATUSES.has(orderStatus)) {
    return { ok: false, status: 403, code: 'NOT_ELIGIBLE_STATUS', message: '此訂單狀態不可申請改期' };
  }
  if (hasPendingRequest) {
    return { ok: false, status: 409, code: 'RESCHEDULE_PENDING', message: '已有改期申請處理中' };
  }
  if (Number(approvedCount) >= RESCHEDULE_MAX_PER_ORDER) {
    return { ok: false, status: 409, code: 'RESCHEDULE_LIMIT_REACHED', message: `每張訂單限改期 ${RESCHEDULE_MAX_PER_ORDER} 次` };
  }
  const startMs = new Date(scheduleStartAt).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(startMs) || startMs - nowMs < RESCHEDULE_WINDOW_HOURS * 3600_000) {
    return { ok: false, status: 403, code: 'RESCHEDULE_WINDOW_CLOSED', message: `行程開始前 ${RESCHEDULE_WINDOW_HOURS} 小時內不可改期` };
  }
  return { ok: true };
}

/**
 * 目標 slot 驗證（申請時的預檢；最終以原子轉移時的容量檢查為準）。
 * @returns {{ ok: true } | { ok: false, status: number, code: string, message: string }}
 */
export function isRescheduleTargetValid({ fromScheduleId, target, peopleCount, now }) {
  if (!target) {
    return { ok: false, status: 404, code: 'SLOT_NOT_FOUND', message: '找不到目標場次' };
  }
  if (target.id === fromScheduleId) {
    return { ok: false, status: 400, code: 'SAME_SLOT', message: '目標場次與原場次相同' };
  }
  if (String(target.status || '').toLowerCase() !== 'open') {
    return { ok: false, status: 409, code: 'SLOT_NOT_OPEN', message: '目標場次未開放' };
  }
  if (new Date(target.startAt).getTime() <= new Date(now).getTime()) {
    return { ok: false, status: 400, code: 'SLOT_IN_PAST', message: '目標場次已開始' };
  }
  const capacity = Number(target.capacity ?? 0);
  const booked = Number(target.bookedCount ?? 0);
  if (capacity > 0 && capacity - booked < Number(peopleCount)) {
    return { ok: false, status: 409, code: 'INSUFFICIENT_CAPACITY', message: '目標場次名額不足' };
  }
  return { ok: true };
}

/** guide 72h 未處理 → lazy expire（讀取/決策時判定，不需 cron）。 */
export function isRescheduleRequestExpired(requestedAt, now) {
  const requestedMs = new Date(requestedAt).getTime();
  return new Date(now).getTime() - requestedMs >= RESCHEDULE_EXPIRE_HOURS * 3600_000;
}

const ERROR_STATUS_BY_CODE = {
  ORDER_NOT_FOUND: 404,
  REQUEST_NOT_FOUND: 404,
  SLOT_NOT_FOUND: 404,
  ACTIVITY_NOT_FOUND: 404,
  BAD_REQUEST: 400,
  SAME_SLOT: 400,
  SLOT_IN_PAST: 400,
  NOT_ELIGIBLE_STATUS: 403,
  RESCHEDULE_WINDOW_CLOSED: 403,
  RESCHEDULE_PENDING: 409,
  RESCHEDULE_LIMIT_REACHED: 409,
  SLOT_NOT_OPEN: 409,
  INSUFFICIENT_CAPACITY: 409,
  REQUEST_NOT_PENDING: 409,
};

/**
 * gateway 擲出的 Error 格式為 `CODE: message` — 轉成 API 回應件。
 * 未知錯誤一律 500 INTERNAL_ERROR（不外洩內部訊息）。
 */
export function rescheduleErrorToResponseParts(error) {
  const raw = String(error?.message || '');
  const idx = raw.indexOf(':');
  const code = idx > 0 ? raw.slice(0, idx).trim() : '';
  if (code in ERROR_STATUS_BY_CODE) {
    return { status: ERROR_STATUS_BY_CODE[code], code, message: raw.slice(idx + 1).trim() };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'unexpected error' };
}

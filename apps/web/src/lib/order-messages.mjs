/**
 * Issue #1411 — 站內訊息第一期純邏輯（發言窗口、通知節流、序列化、body 驗證）。
 * owner 定案（2026-06-11）：窗口 = 付款後（paid/confirmed）～ completed 後 14 天，
 * 之後留言串轉唯讀；cancelled/refund 系列一律唯讀；pending_payment 不可見。
 * 通知節流：同訂單同角色 15 分鐘內連發只通知第一則。
 */

export const ORDER_MESSAGE_MAX_LENGTH = 1000;
export const ORDER_MESSAGE_READONLY_DAYS = 14;
export const ORDER_MESSAGE_NOTIFY_THROTTLE_MINUTES = 15;

/** 可發言狀態（reschedule_requested 是付款後的暫態，溝通需求最強）。 */
const POSTABLE_STATUSES = new Set(['paid', 'confirmed', 'reschedule_requested']);
/** 唯讀可見狀態（曾付款、串可能已有內容）。 */
const READONLY_STATUSES = new Set(['cancelled', 'refunded', 'refunding', 'refund_requested']);

/**
 * 發言窗口判斷。completed 以 completedAt > scheduleEndAt > scheduleStartAt 起算 14 天。
 * @returns {{ canView: boolean, canPost: boolean, reason: string|null }}
 */
export function getOrderMessageWindow({ orderStatus, scheduleStartAt, scheduleEndAt, completedAt, now } = {}) {
  const status = String(orderStatus || '');
  if (POSTABLE_STATUSES.has(status)) {
    return { canView: true, canPost: true, reason: null };
  }
  if (status === 'completed') {
    const refMs = new Date(completedAt || scheduleEndAt || scheduleStartAt || 0).getTime();
    const nowMs = new Date(now || Date.now()).getTime();
    const withinWindow =
      Number.isFinite(refMs) && nowMs - refMs <= ORDER_MESSAGE_READONLY_DAYS * 86400_000;
    return withinWindow
      ? { canView: true, canPost: true, reason: null }
      : { canView: true, canPost: false, reason: 'MESSAGE_WINDOW_CLOSED' };
  }
  if (READONLY_STATUSES.has(status)) {
    return { canView: true, canPost: false, reason: 'MESSAGE_WINDOW_CLOSED' };
  }
  return { canView: false, canPost: false, reason: 'MESSAGE_WINDOW_CLOSED' };
}

/**
 * 通知節流：同角色最後一則距今 < 15 分鐘 → 不重複通知。
 * previousMessages 接受 in-memory（senderRole/createdAt）與 Supabase row（sender_role/created_at）。
 */
export function shouldNotifyOrderMessage({ previousMessages = [], senderRole, now } = {}) {
  const nowMs = new Date(now || Date.now()).getTime();
  let lastMs = -Infinity;
  for (const m of previousMessages) {
    const role = m?.senderRole ?? m?.sender_role;
    if (role !== senderRole) continue;
    const ts = new Date(m?.createdAt ?? m?.created_at ?? 0).getTime();
    if (Number.isFinite(ts) && ts > lastMs) lastMs = ts;
  }
  return nowMs - lastMs >= ORDER_MESSAGE_NOTIFY_THROTTLE_MINUTES * 60_000;
}

/** Supabase row / in-memory 物件 → 統一 API shape（契約測試錨點）。 */
export function serialiseOrderMessage(row = {}) {
  return {
    id: String(row.id ?? ''),
    orderId: String(row.orderId ?? row.order_id ?? ''),
    senderRole: String(row.senderRole ?? row.sender_role ?? ''),
    senderId: row.senderId ?? row.sender_id ?? null,
    body: String(row.body ?? ''),
    createdAt: row.createdAt ?? row.created_at ?? null,
  };
}

/**
 * @returns {{ ok: true, value: string } | { ok: false, status: number, code: string, message: string }}
 */
export function validateOrderMessageBody(body) {
  if (typeof body !== 'string') {
    return { ok: false, status: 400, code: 'BAD_REQUEST', message: '留言內容為必填' };
  }
  const value = body.trim();
  if (!value) {
    return { ok: false, status: 400, code: 'BAD_REQUEST', message: '留言內容為必填' };
  }
  if (value.length > ORDER_MESSAGE_MAX_LENGTH) {
    return { ok: false, status: 400, code: 'MESSAGE_TOO_LONG', message: `留言最長 ${ORDER_MESSAGE_MAX_LENGTH} 字` };
  }
  return { ok: true, value };
}

const ERROR_STATUS_BY_CODE = {
  ORDER_NOT_FOUND: 404,
  BAD_REQUEST: 400,
  MESSAGE_TOO_LONG: 400,
  FORBIDDEN: 403,
  MESSAGE_WINDOW_CLOSED: 403,
};

/**
 * gateway 擲出的 Error 格式為 `CODE: message` — 轉成 API 回應件。
 * 未知錯誤一律 500 INTERNAL_ERROR（不外洩內部訊息）。
 */
export function orderMessageErrorToResponseParts(error) {
  const raw = String(error?.message || '');
  const idx = raw.indexOf(':');
  const code = idx > 0 ? raw.slice(0, idx).trim() : '';
  if (code in ERROR_STATUS_BY_CODE) {
    return { status: ERROR_STATUS_BY_CODE[code], code, message: raw.slice(idx + 1).trim() };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'unexpected error' };
}

/**
 * #1497 — 衝突例外開放「幫手確認」狀態機（純函式，依 db.mjs strangler 準則）。
 *
 * helper_status 取值：not_needed / required / pending_assignment / assigned / declined。
 * 導遊端只能對「等待幫手協調」的 override 表態：
 *   - confirm → assigned（找到幫手，可服務）
 *   - decline → declined（無法安排幫手）
 *
 * 合法來源狀態僅 required / pending_assignment；not_needed（不需幫手）與
 * assigned / declined（已成終態）導遊不得再改。
 */

/** 導遊可表態的來源狀態。 */
export const GUIDE_ACTIONABLE_HELPER_STATUSES = Object.freeze([
  'required',
  'pending_assignment',
]);

/** 導遊動作 → 目標 helper_status。 */
const ACTION_TO_STATUS = Object.freeze({
  confirm: 'assigned',
  decline: 'declined',
});

/**
 * 判定導遊幫手表態是否合法。
 * @param {string} currentStatus 目前 helper_status
 * @param {string} action 導遊動作（confirm / decline，其餘回 INVALID_ACTION）
 * @returns {{allowed: true, nextStatus: string} | {allowed: false, code: string, messageZh: string}}
 */
export function resolveConflictOverrideHelperTransition(currentStatus, action) {
  const nextStatus = ACTION_TO_STATUS[action];
  if (!nextStatus) {
    return {
      allowed: false,
      code: 'INVALID_ACTION',
      messageZh: 'action 須為 confirm 或 decline',
    };
  }

  if (currentStatus === 'not_needed') {
    return {
      allowed: false,
      code: 'HELPER_NOT_REQUIRED',
      messageZh: '此例外時段不需幫手，無需確認',
    };
  }

  if (currentStatus === 'assigned' || currentStatus === 'declined') {
    return {
      allowed: false,
      code: 'HELPER_ALREADY_DECIDED',
      messageZh: '此時段的幫手狀態已確定，無法再次變更',
    };
  }

  if (!GUIDE_ACTIONABLE_HELPER_STATUSES.includes(currentStatus)) {
    return {
      allowed: false,
      code: 'HELPER_STATUS_NOT_ACTIONABLE',
      messageZh: '目前狀態無法由導遊變更',
    };
  }

  return { allowed: true, nextStatus };
}

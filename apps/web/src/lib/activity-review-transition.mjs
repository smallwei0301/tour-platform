/**
 * 導遊行程審核動作的狀態機（純函式，離線可單測）。
 * db.mjs（Supabase）共用同一份轉移規則。
 *
 * review_state 三態：
 *   - null               無待審修訂
 *   - 'pending'          導遊已送審、等待 admin 處理
 *   - 'changes_requested' admin 退回、保留 pending_changes 讓導遊續修
 *
 * 上架（status=draft/published/archived）不在此狀態機 —— 由 route 沿用既有
 * validateActivityBookability 把關，審核與上架兩件事分開（見計劃核心架構決策 #3）。
 */

/**
 * @param {'submit'|'approve'|'reject'} action
 * @param {{ now: string }} _ctx
 * @returns {{
 *   reviewState: null | 'pending' | 'changes_requested',
 *   applyPending: boolean,   // 是否把 pending_changes merge 進 live 欄位
 *   clearPending: boolean,   // 是否清空 pending_changes
 *   recordSubmission: boolean, // 是否記錄送審時間／base 快照
 * }}
 */
export function resolveActivityReviewTransition(action, _ctx = {}) {
  switch (action) {
    case 'submit':
      return {
        reviewState: 'pending',
        applyPending: false,
        clearPending: false,
        recordSubmission: true,
      };
    case 'approve':
      return {
        reviewState: null,
        applyPending: true,
        clearPending: true,
        recordSubmission: false,
      };
    case 'reject':
      // 退回不清 pending_changes：導遊看得到自己填的內容、改完可再送審。
      return {
        reviewState: 'changes_requested',
        applyPending: false,
        clearPending: false,
        recordSubmission: false,
      };
    default:
      throw new Error('invalid activity review action');
  }
}

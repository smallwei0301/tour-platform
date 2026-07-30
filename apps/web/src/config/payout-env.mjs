/**
 * 出款相關的環境變數讀取（#1777）。
 *
 * 集中在 src/config/* 是專案的既定規範（architecture-ratchet-guard 第 3 項：
 * 「新程式的 env 讀取一律經 src/config」）。本檔只做讀取，不含任何判斷邏輯——
 * fail-closed 的判定在 src/lib/settlement/payout-confirm-guard.mjs。
 *
 * 注意：這是**新增**的 config 檔，未觸碰凍結區的 security-env.mjs／startup-env.mjs。
 */

/**
 * 確認出款的解鎖旗標原始值（未解析）。
 *
 * 刻意回傳原始字串而非布林：判定規則（必須精確等於 "true"）屬於 guard 的
 * 責任，集中在一處才不會出現「這裡收 '1' 那裡不收」的分歧。
 *
 * @returns {string|undefined}
 */
export function getPayoutConfirmEnabledRaw() {
  return process.env.PAYOUT_CONFIRM_ENABLED;
}

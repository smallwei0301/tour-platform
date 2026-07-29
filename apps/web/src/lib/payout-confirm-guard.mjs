/**
 * 確認出款（payout confirm）的 fail-closed 開關 —— Issue #1777 決策 A。
 *
 * 為什麼存在：
 *   confirmPayoutDb（db-payouts.mjs:59-116）目前把「扣 guide_balances →
 *   payouts pending→paid → 寫 audit」拆成三次獨立呼叫，不在同一 transaction。
 *   扣款成功但 payout update 失敗時，payout 仍是 pending 而餘額已被扣，重試會
 *   再扣一次；`Math.max(0, …)` 還會把餘額不足靜默截成 0。在 #1777 Phase 2 的
 *   fn_confirm_payout_atomic 完成並驗收前，真實出款一律 HOLD。
 *
 * 為什麼不沿用 cron-job-controls 的 kill-switch：
 *   isCronJobEnabled 是**刻意 fail-open**（讀取失敗一律視為 enabled，因為
 *   「排程連續性優先於後台可用性」）。金流出款的語意完全相反——任何讀不到或
 *   解析不了的狀態都必須擋下。且 payout confirm 是 admin 手動 API 而非排程
 *   job，登記進 CRON_JOBS registry 會讓後台排程清單出現不存在的工作。
 *
 * 設計原則（fail-closed）：
 *   - 預設擋下。只有 PAYOUT_CONFIRM_ENABLED 精確等於 "true"（忽略大小寫與
 *     前後空白）才放行——不接受 "1"／"yes"／"on" 等寬鬆真值，避免誤設解鎖。
 *   - 任何讀取例外都回擋下，絕不 fail-open。
 *
 * 解除方式：Phase 2 原子 RPC 上線並驗收後，於部署環境設 PAYOUT_CONFIRM_ENABLED=true
 * （或直接移除本 guard，由該 PR 決定）。
 */

/** 穩定錯誤碼——前端顯示與稽核比對皆以此為準。 */
export const PAYOUT_CONFIRM_HOLD_CODE = 'PAYOUT_CONFIRM_ON_HOLD';

const HOLD_REASON_ZH =
  '確認出款暫停中：結算與出款尚未收斂為單一交易（#1777），'
  + '現在確認可能重複扣減導遊餘額。原子化修復驗收後才會重新開放。';

/**
 * 現在是否允許執行真實的 payout confirm。
 *
 * @param {Record<string, string|undefined>|null|undefined} [env] 供測試注入；
 *        預設讀 process.env。
 * @returns {{ allowed: boolean, code: string|null, reasonZh: string|null }}
 */
export function isPayoutConfirmAllowed(env) {
  try {
    const source = env === undefined ? process.env : env;
    // null / 非物件 → 讀不到狀態 → 擋下
    if (!source || typeof source !== 'object') {
      return { allowed: false, code: PAYOUT_CONFIRM_HOLD_CODE, reasonZh: HOLD_REASON_ZH };
    }

    const raw = source.PAYOUT_CONFIRM_ENABLED;
    if (typeof raw === 'string' && raw.trim().toLowerCase() === 'true') {
      return { allowed: true, code: null, reasonZh: null };
    }

    return { allowed: false, code: PAYOUT_CONFIRM_HOLD_CODE, reasonZh: HOLD_REASON_ZH };
  } catch {
    // 讀取本身拋錯（例如被代理的 env 物件）——fail-closed。
    return { allowed: false, code: PAYOUT_CONFIRM_HOLD_CODE, reasonZh: HOLD_REASON_ZH };
  }
}

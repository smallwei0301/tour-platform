/**
 * 結算金額的整數運算（Issue #1777 F8）——JS 與 DB 端的唯一真實來源。
 *
 * ## 為什麼不能用浮點
 *
 * `settlement_rules.commission_rate` 是 `numeric(5,4)`。DB 端 `numeric` 是精確
 * 十進位，JS 的 `number` 是 IEEE754 double —— 兩者對同一條公式會給出不同答案：
 *
 *     rate = 0.30, effective = 90
 *     JS  : 1 - 0.30 = 0.6999999999999999556…  →  90 × 0.7 = 62.99999999999999
 *           Math.floor(...) = 62
 *     SQL : 90 × 0.7000 = 63.0000  →  floor(...) = 63
 *
 * 導遊少拿 NT$1，而且導遊 dashboard 看到的估算（JS）與實際結算（SQL）會不一致。
 * 實測 rate=0.30、effective 1..200000：net 有 **4,676** 個值分歧，第一個是 90。
 * rate=0.15（目前 active）分歧數為 0，所以這是個尚未觸發的陷阱，不是現存錯帳。
 *
 * ## 作法
 *
 * 改用基點（basis point）整數運算：`floor(amount × bp / 10000)`。
 * `amount × bp` 是整數乘積（TWD 金額 × 10000 遠低於 2^53），完全避開浮點。
 * 因為 rate 正好四位小數，`round(rate × 10000)` 是無損轉換，因此 JS 的結果與
 * DB 端 numeric 運算**逐值相同**。
 *
 * ## 整數規則（docs/05-business/06-payment-plan/03-settlement-rules.md §4）
 *
 *     effective  = max(0, total − 累積退款)
 *     commission = floor(effective × rate)
 *     net        = floor(effective × (1 − rate))
 *
 * commission 與 net **各自** floor，殘差歸平台 —— 因此 `gmv ≠ commission + net`
 * 是預期行為，對帳時不得當成差異。
 *
 * 本檔刻意是 `.mjs`：settlement-config.ts（TS）與 accounting/reconciliation.mjs
 * 都要用，放 .mjs 才能兩邊共用同一份實作而不是各抄一遍。
 */

/** 分潤率 → 基點。rate 0.15 → 1500。numeric(5,4) 保證無損。 */
export function commissionRateToBasisPoints(rate) {
  return Math.round((Number(rate) || 0) * 10000);
}

/** `floor(amount × bp / 10000)`，全程整數運算。 */
export function floorByBasisPoints(amountTwd, basisPoints) {
  const amount = Math.trunc(Number(amountTwd) || 0);
  const bp = Math.trunc(Number(basisPoints) || 0);
  return Math.floor((amount * bp) / 10000);
}

/** 平台抽成：`floor(effective × rate)`。 */
export function computeCommissionTwd(effectiveTwd, rate) {
  return floorByBasisPoints(effectiveTwd, commissionRateToBasisPoints(rate));
}

/** 導遊淨額：`floor(effective × (1 − rate))`。 */
export function computeNetTwd(effectiveTwd, rate) {
  return floorByBasisPoints(effectiveTwd, 10000 - commissionRateToBasisPoints(rate));
}

/** 未退款有效金額：`max(0, total − 累積退款)`。 */
export function effectiveGmvTwd(totalTwd, refundTwd) {
  return Math.max(0, (Number(totalTwd) || 0) - (Number(refundTwd) || 0));
}

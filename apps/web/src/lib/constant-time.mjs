/**
 * Constant-time string comparison (edge-safe, pure JS).
 *
 * 健檢 v2 S2（docs/operations/reports/repo-health-audit-20260702.md）：
 * admin token 與 guide HMAC 簽章比對不得用短路 `!==`，避免 timing side-channel。
 *
 * 為什麼不用 node:crypto 的 timingSafeEqual：admin-auth.mjs 被 edge middleware
 * 引用（middleware.ts），edge runtime 沒有 Node crypto。此純 JS XOR 迴圈在
 * edge 與 Node 皆可用；長度不同時仍走完整迴圈（以較長者為準），僅回傳前才
 * 反映長度差異。
 */
export function constantTimeEquals(a, b) {
  const strA = typeof a === 'string' ? a : String(a ?? '');
  const strB = typeof b === 'string' ? b : String(b ?? '');
  const len = Math.max(strA.length, strB.length);
  let diff = strA.length === strB.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    // charCodeAt 超出長度回 NaN，NaN ^ x 為 NaN → 用 0 代替以保持數值運算
    const ca = i < strA.length ? strA.charCodeAt(i) : 0;
    const cb = i < strB.length ? strB.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

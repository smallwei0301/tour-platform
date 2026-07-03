// Issue #1526 — LINE Login（C′ 後端 idToken 橋接）帳號解析純邏輯。
//
// 遵守 #1385 strangler：新資料存取不進 db.mjs 單體；本檔為**純函式**，
// 不觸 Supabase／DB —— 由呼叫端（route）備妥 existingMapping／
// existingUserIdByEmail 後傳入，回傳「該建帳/連結/登入既有」的決策。
//
// 帳號合併策略（decision note，權威鍵＝line_user_mapping.line_user_id，非 email）：
//   1. line_user_id 已綁定 → bind_existing（直接登入該 user）
//   2. 未綁定 + 已驗證 email + 自動連結開啟 → link_by_email（連結既有 email 帳號）
//   3. 其餘（無 email / email 未驗證 / 自動連結關閉）→ create_new
//   4. autoLinkVerifiedEmail 預設 false（首發只記 log 不自動併帳，防搶號）

/**
 * LINE 無 email 時的 placeholder email：line_{sub}@line.local。
 * 穩定、可反查 sub、無 PII；清掉非法字元避免非法 email。
 * @param {string} lineUserId
 * @returns {string}
 */
export function buildPlaceholderEmail(lineUserId) {
  const safe = String(lineUserId || '')
    .trim()
    .replace(/[^\w.\-]/g, '');
  return `line_${safe}@line.local`;
}

/**
 * @param {{
 *   lineUserId: string,
 *   email?: string,
 *   emailVerified?: boolean,
 *   existingMapping?: { userId?: string|null }|null,
 *   existingUserIdByEmail?: string|null,
 *   autoLinkVerifiedEmail?: boolean,
 * }} params
 * @returns {{ action: 'bind_existing'|'link_by_email'|'create_new'|'invalid',
 *             userId?: string, email?: string, note: string }}
 */
export function resolveLineLoginAccount({
  lineUserId,
  email,
  emailVerified = false,
  existingMapping = null,
  existingUserIdByEmail = null,
  autoLinkVerifiedEmail = false,
} = {}) {
  const sub = String(lineUserId || '').trim();
  if (!sub) return { action: 'invalid', note: 'missing lineUserId' };

  // 1. 已綁定 → 直接登入既有 user（Google 建的帳號無縫共用）
  if (existingMapping && existingMapping.userId) {
    return { action: 'bind_existing', userId: String(existingMapping.userId), note: 'line_user_id already bound' };
  }

  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';

  // 2. 未綁定 + 已驗證 email + 自動連結開啟 → 連結既有 email 帳號
  if (autoLinkVerifiedEmail && emailVerified && normalizedEmail && existingUserIdByEmail) {
    return {
      action: 'link_by_email',
      userId: String(existingUserIdByEmail),
      email: normalizedEmail,
      note: 'linked to existing verified-email account',
    };
  }

  // 3. 其餘 → 建新帳號（無 email 用 placeholder）
  return {
    action: 'create_new',
    email: normalizedEmail || buildPlaceholderEmail(sub),
    note: normalizedEmail ? 'create new account with LINE email' : 'create new account with placeholder email',
  };
}

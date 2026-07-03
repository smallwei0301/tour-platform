// Issue #1526 — LINE Login session 簽發 orchestration。
//
// 把「已驗證的 LINE 身分 → Supabase session + 綁定」抽成可注入 deps 的 service，
// 讓 /api/auth/line（LIFF idToken POST）與未來的瀏覽器 OAuth callback 共用同一
// 邏輯，且能用 mock deps 單測（不真的打 Supabase）。
//
// deps（全部注入，便於測試）：
//   admin      — service-role client（auth.admin.createUser/getUserById/generateLink、from('users')）
//   ssr        — SSR client（auth.verifyOtp 設 session cookie）
//   getMapping — (lineUserId) => Promise<{userId}|null>
//   upsertMapping — ({lineUserId,userId,displayName}) => Promise<any>
//   resolve    — resolveLineLoginAccount（純函式，預設帶入）
//   autoLink   — boolean（verified-email 自動連結，預設 false）

import { resolveLineLoginAccount } from './line-login.mjs';

/**
 * @returns {Promise<{ ok: true, action: string, userId: string }
 *                   | { ok: false, code: string, message: string, status: number }>}
 */
export async function issueLineSession({ lineUserId, email, name }, deps) {
  const {
    admin,
    ssr,
    getMapping,
    upsertMapping,
    resolve = resolveLineLoginAccount,
    autoLink = false,
  } = deps || {};

  const emailVerified = !!email;
  const existingMapping = await getMapping(lineUserId);

  let existingUserIdByEmail = null;
  if (autoLink && emailVerified && email) {
    const { data } = await admin.from('users').select('id').eq('email', email).maybeSingle();
    existingUserIdByEmail = data?.id ?? null;
  }

  const decision = resolve({
    lineUserId,
    email,
    emailVerified,
    existingMapping,
    existingUserIdByEmail,
    autoLinkVerifiedEmail: autoLink,
  });

  if (decision.action === 'invalid') {
    return { ok: false, code: 'LINE_IDTOKEN_INVALID', message: 'no subject', status: 401 };
  }

  let userId;
  let sessionEmail;

  if (decision.action === 'create_new') {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: decision.email,
      email_confirm: true,
      user_metadata: name ? { name } : {},
      app_metadata: { line_user_id: lineUserId },
    });
    if (createErr || !created?.user) {
      return { ok: false, code: 'LINE_LOGIN_FAILED', message: 'could not create account', status: 500 };
    }
    userId = created.user.id;
    sessionEmail = decision.email;
  } else {
    userId = decision.userId;
    const { data: got, error: getErr } = await admin.auth.admin.getUserById(userId);
    if (getErr || !got?.user?.email) {
      return { ok: false, code: 'LINE_LOGIN_FAILED', message: 'could not resolve account', status: 500 };
    }
    sessionEmail = got.user.email;
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: sessionEmail,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return { ok: false, code: 'LINE_LOGIN_FAILED', message: 'could not issue session', status: 500 };
  }

  const { error: otpErr } = await ssr.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
  if (otpErr) {
    return { ok: false, code: 'LINE_LOGIN_FAILED', message: 'could not establish session', status: 500 };
  }

  // 登入即綁定（失敗不阻斷登入，session 已建立）
  try {
    await upsertMapping({ lineUserId, userId, displayName: name ?? null });
  } catch {
    // best-effort；記 log 由呼叫端負責
  }

  return { ok: true, action: decision.action, userId };
}

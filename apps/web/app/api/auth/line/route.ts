/**
 * POST /api/auth/line — LINE Login（#1526，C′ 後端 idToken 橋接）
 *
 * 前端（一般瀏覽器 LINE OAuth／LINE 內 LIFF）取得 idToken 後打此端點：
 *   1. verifyLiffIdToken 驗 aud=LINE_LOGIN_CHANNEL_ID／exp／簽章 → lineUserId, email, name
 *   2. resolveLineLoginAccount（純函式）依 line_user_mapping／email 決定 bind/link/create
 *   3. service-role admin 建帳或取既有 user → admin.generateLink(magiclink) 取 token_hash
 *      → SSR client verifyOtp 簽發標準 Supabase session cookie（與 Google 登入同構）
 *   4. upsertLineMapping — 登入即綁定（LINE 通知與登入同一身分）
 *
 * Flag：NEXT_PUBLIC_LINE_LOGIN_ENABLED（預設 OFF → 回停用，Google 登入不受影響）。
 * CSRF：/api/auth/* 於 middleware 一律 exempt（issuance 端點）。Rate-limit：limiters.lineAuth。
 * 帳號合併第 3 點（verified-email 自動連結）預設 OFF（防搶號），由
 * LINE_LOGIN_AUTOLINK_VERIFIED_EMAIL 控制；關閉時同 email 一律建新帳號並記 log。
 */
import { createClient } from '../../../../src/lib/supabase/server';
import { successV2, errorV2 } from '../../../../src/lib/api';
import { limiters, RateLimiter, createRateLimitResponse } from '../../../../src/lib/rate-limit';
import { verifyLiffIdToken } from '../../../../src/lib/line-liff-verify.mjs';
import { getLineMappingByLineUserId, upsertLineMapping } from '../../../../src/lib/line-binding.mjs';
import { getSupabase } from '../../../../src/lib/db.mjs';
import { issueLineSession } from '../../../../src/lib/line-login-session.mjs';
import { isLineLoginEnabled, isLineLoginAutoLinkEmailEnabled } from '../../../../src/config/feature-flags.mjs';

function safeInternalNext(raw: unknown): string {
  const next = typeof raw === 'string' ? raw : '';
  // 僅允許站內相對路徑（單一斜線開頭），擋 open-redirect
  if (next.startsWith('/') && !next.startsWith('//')) return next;
  return '/';
}

export async function POST(request: Request) {
  // Flag OFF → 端點停用（Google 登入不受影響）
  if (!isLineLoginEnabled()) {
    return Response.json(errorV2('LINE_LOGIN_DISABLED', 'LINE login is not enabled'), { status: 404 });
  }

  const clientIp = RateLimiter.getClientIp(request);
  const rateLimitResponse = createRateLimitResponse(limiters.lineAuth.check(clientIp));
  if (rateLimitResponse) return rateLimitResponse;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'invalid JSON body'), { status: 400 });
  }

  const idToken = typeof body?.idToken === 'string' ? body.idToken : '';
  if (!idToken) {
    return Response.json(errorV2('VALIDATION_ERROR', 'idToken is required'), { status: 400 });
  }
  const next = safeInternalNext(body?.next);

  const verified = await verifyLiffIdToken(idToken);
  if (!verified.ok) {
    return Response.json(errorV2('LINE_IDTOKEN_INVALID', verified.reason), { status: 401 });
  }

  try {
    const admin = await getSupabase();
    const ssr = await createClient();
    const result = await issueLineSession(
      { lineUserId: verified.lineUserId, email: verified.email, name: verified.name },
      {
        admin,
        ssr,
        getMapping: getLineMappingByLineUserId,
        upsertMapping: upsertLineMapping,
        autoLink: isLineLoginAutoLinkEmailEnabled(),
      },
    );

    if (!result.ok) {
      return Response.json(errorV2(result.code, result.message), { status: result.status });
    }
    return Response.json(successV2({ action: result.action, redirect: next }));
  } catch (err) {
    console.error('[auth/line] unexpected error:', err instanceof Error ? err.message : err);
    return Response.json(errorV2('LINE_LOGIN_FAILED', 'unexpected error'), { status: 500 });
  }
}

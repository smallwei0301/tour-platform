/**
 * GET /auth/line/callback — 瀏覽器 LINE OAuth 回程（#1526，C′）
 *
 * 登入頁「用 LINE 登入」→ LINE authorize → 本 callback：
 *   1. 以 code + LINE_LOGIN_CHANNEL_ID/SECRET 向 LINE token 端點換 id_token
 *   2. verifyLiffIdToken 驗 id_token → lineUserId/email/name
 *   3. issueLineSession 簽發 Supabase session cookie + 登入即綁定
 *   4. redirect 回 state.next（僅站內）
 *
 * Flag OFF 或 channel 未設 → 導回 /login?error（不影響 Google 登入）。
 * LIFF（LINE 內）路徑改打 POST /api/auth/line（直接帶 idToken），共用 issueLineSession。
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '../../../../src/lib/supabase/server';
import { verifyLiffIdToken } from '../../../../src/lib/line-liff-verify.mjs';
import { getLineMappingByLineUserId, upsertLineMapping } from '../../../../src/lib/line-binding.mjs';
import { getSupabase } from '../../../../src/lib/db.mjs';
import { issueLineSession } from '../../../../src/lib/line-login-session.mjs';
import { isLineLoginEnabled, isLineLoginAutoLinkEmailEnabled } from '../../../../src/config/feature-flags.mjs';

function safeNext(raw: string): string {
  try {
    const parsed = JSON.parse(raw || '{}');
    const next = typeof parsed?.next === 'string' ? parsed.next : '';
    if (next.startsWith('/') && !next.startsWith('//')) return next;
  } catch {
    /* ignore */
  }
  return '/';
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const loginError = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, origin));

  if (!isLineLoginEnabled()) return loginError('line_login_disabled');

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('state') ?? '');
  if (!code) return loginError('line_no_code');

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID ?? '';
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET ?? '';
  if (!channelId || !channelSecret) return loginError('line_not_configured');

  try {
    // 1. code → tokens（LINE token 端點）
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${origin}/auth/line/callback`,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });
    if (!tokenRes.ok) return loginError('line_token_exchange_failed');
    const tokens = await tokenRes.json();
    const idToken = tokens?.id_token;
    if (!idToken) return loginError('line_no_id_token');

    // 2. 驗 id_token（aud=login channel、exp、簽章來源）
    const verified = await verifyLiffIdToken(idToken);
    if (!verified.ok) return loginError('line_idtoken_invalid');

    // 3. 簽發 session + 綁定
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
    if (!result.ok) return loginError('line_session_failed');

    // 4. redirect 回站內 next
    return NextResponse.redirect(new URL(next, origin));
  } catch (err) {
    console.error('[auth/line/callback] error:', err instanceof Error ? err.message : err);
    return loginError('line_login_error');
  }
}

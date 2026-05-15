import { ok, fail } from '../../../../../src/lib/api';
import {
  verifyGuideSession,
  hashPassword,
  verifyPassword,
  isInviteTokenExpired,
  createGuideSessionCookies,
  clearGuideSessionCookies,
} from '../../../../../src/lib/guide-auth';
import { CSRF_COOKIE_NAME, createCsrfCookie, createCsrfToken, validateCsrf } from '../../../../../src/lib/csrf.mjs';
import { getGuideAuthSupabaseClient } from '../../../../../src/lib/guide-auth-session-route.test-support';

type GuideSessionInviteProfile = {
  id: string;
  display_name: string;
  invite_token: string | null;
  invite_token_expires_at: string | null;
  guide_session_version: number | null;
};

type GuideSessionLoginProfile = {
  id: string;
  display_name: string;
  guide_password_hash: string | null;
  guide_session_version: number | null;
  verification_status: string;
};

type SupabaseSingleResult<T> = {
  data: T | null;
  error: unknown | null;
};

const SUPABASE_QUERY_TIMEOUT_MS = Number(process.env.GUIDE_AUTH_SUPABASE_TIMEOUT_MS ?? 8000);

function timeoutError() {
  const err = new Error('GUIDE_AUTH_SUPABASE_TIMEOUT');
  (err as Error & { code?: string }).code = 'GUIDE_AUTH_SUPABASE_TIMEOUT';
  return err;
}

async function withTimeout<T>(promise: Promise<T>, ms = SUPABASE_QUERY_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** GET — check current guide session */
export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  const token = createCsrfToken();
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', createCsrfCookie(token));

  if (!session) {
    return new Response(JSON.stringify(ok({ authorized: false })), { status: 200, headers });
  }

  return new Response(
    JSON.stringify(ok({ authorized: true, guideId: session.guideId, guideName: session.guideName })),
    { status: 200, headers }
  );
}

/** POST — login (first-time via invite token, or password login) */
export async function POST(req: Request) {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  try {
    const body = await req.json().catch(() => ({}));
    const { token, password, guideId: loginGuideId } = body as Record<string, string>;

    if (!process.env.SUPABASE_URL) {
      return Response.json(fail('NOT_AVAILABLE', 'Auth not configured'), { status: 503 });
    }

    const supabase = await getGuideAuthSupabaseClient();

    // ── First-time login via invite token ──────────────────────────────────────
    if (token) {
      if (!password || password.length < 6) {
        return Response.json(fail('INVALID_PASSWORD', '密碼至少 6 個字元'), { status: 400 });
      }

      const { data: guide, error } = await withTimeout<SupabaseSingleResult<GuideSessionInviteProfile>>(
        supabase
          .from('guide_profiles')
          .select('id, display_name, invite_token, invite_token_expires_at, guide_session_version')
          .eq('invite_token', token)
          .single()
      );

      if (error || !guide) {
        return Response.json(fail('INVALID_TOKEN', '邀請碼無效或已使用'), { status: 401 });
      }

      if (!guide.invite_token_expires_at || isInviteTokenExpired(guide.invite_token_expires_at)) {
        return Response.json(fail('TOKEN_EXPIRED', '邀請碼已過期，請聯絡管理員重新產生'), { status: 401 });
      }

      const passwordHash = hashPassword(password);

      await withTimeout(
        supabase
          .from('guide_profiles')
          .update({
            guide_password_hash: passwordHash,
            invite_token: null,
            invite_token_expires_at: null,
          })
          .eq('id', guide.id)
      );

      const sessionVersion = guide.guide_session_version ?? 1;
      const cookies = createGuideSessionCookies(guide.id, guide.display_name, sessionVersion, true);
      const headers = new Headers({ 'content-type': 'application/json' });
      cookies.forEach((c) => headers.append('set-cookie', c));
      headers.append('set-cookie', createCsrfCookie(createCsrfToken()));

      return new Response(JSON.stringify(ok({ created: true })), { status: 200, headers });
    }

    // ── Regular password login (email + password) ─────────────────────────────
    const loginEmail = (body.email as string | undefined)?.toLowerCase().trim();
    if (loginEmail && password) {
      const { data: guide, error } = await withTimeout<SupabaseSingleResult<GuideSessionLoginProfile>>(
        supabase
          .from('guide_profiles')
          .select('id, display_name, guide_password_hash, guide_session_version, verification_status')
          .eq('guide_email', loginEmail)
          .single()
      );

      if (error || !guide) {
        return Response.json(fail('INVALID_CREDENTIALS', '帳號或密碼錯誤'), { status: 401 });
      }

      if (guide.verification_status !== 'approved') {
        return Response.json(fail('ACCOUNT_SUSPENDED', '帳號已停用'), { status: 403 });
      }

      if (!guide.guide_password_hash || !verifyPassword(password, guide.guide_password_hash)) {
        return Response.json(fail('INVALID_CREDENTIALS', '帳號或密碼錯誤'), { status: 401 });
      }

      const sessionVersion = guide.guide_session_version ?? 1;
      const cookies = createGuideSessionCookies(guide.id, guide.display_name, sessionVersion, false);
      const headers = new Headers({ 'content-type': 'application/json' });
      cookies.forEach((c) => headers.append('set-cookie', c));
      headers.append('set-cookie', createCsrfCookie(createCsrfToken()));

      return new Response(JSON.stringify(ok({ created: true })), { status: 200, headers });
    }

    // ── Legacy: guideId + password (backward compat) ───────────────────────────
    if (loginGuideId && password) {
      const { data: guide, error } = await withTimeout<SupabaseSingleResult<GuideSessionLoginProfile>>(
        supabase
          .from('guide_profiles')
          .select('id, display_name, guide_password_hash, guide_session_version, verification_status')
          .eq('id', loginGuideId)
          .single()
      );

      if (error || !guide) {
        return Response.json(fail('INVALID_CREDENTIALS', '帳號或密碼錯誤'), { status: 401 });
      }

      if (guide.verification_status !== 'approved') {
        return Response.json(fail('ACCOUNT_SUSPENDED', '帳號已停用'), { status: 403 });
      }

      if (!guide.guide_password_hash || !verifyPassword(password, guide.guide_password_hash)) {
        return Response.json(fail('INVALID_CREDENTIALS', '帳號或密碼錯誤'), { status: 401 });
      }

      const sessionVersion = guide.guide_session_version ?? 1;
      const cookies = createGuideSessionCookies(guide.id, guide.display_name, sessionVersion, false);
      const headers = new Headers({ 'content-type': 'application/json' });
      cookies.forEach((c) => headers.append('set-cookie', c));
      headers.append('set-cookie', createCsrfCookie(createCsrfToken()));

      return new Response(JSON.stringify(ok({ created: true })), { status: 200, headers });
    }

    return Response.json(fail('BAD_REQUEST', '請提供登入憑證'), { status: 400 });
  } catch (error) {
    const code = (error as Error & { code?: string })?.code;
    if (code === 'GUIDE_AUTH_SUPABASE_TIMEOUT') {
      return Response.json(fail('AUTH_TEMPORARILY_UNAVAILABLE', '登入服務暫時忙碌，請稍後再試'), { status: 503 });
    }

    return Response.json(fail('INTERNAL_ERROR', 'Unexpected auth error'), { status: 500 });
  }
}

/** DELETE — logout */
export async function DELETE(request: Request) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const headers = new Headers({ 'content-type': 'application/json' });
  clearGuideSessionCookies().forEach((c) => headers.append('set-cookie', c));
  headers.append('set-cookie', `${CSRF_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return new Response(JSON.stringify(ok({ deleted: true })), { status: 200, headers });
}

import { cache } from 'react';
import {
  MidaoRuntimeAccessError,
  verifyCanonicalGuideSession,
  type CanonicalGuideRuntime,
} from './canonical-guide-session.ts';

const LOGIN_DESTINATION = '/guide/login?next=%2Fmidao';
const LEGACY_DESTINATION = '/guide/dashboard';

type PageSessionOptions = {
  runtime?: CanonicalGuideRuntime | null;
  flags?: { backendEnabled: boolean };
};

type ReadySession = Awaited<ReturnType<typeof verifyCanonicalGuideSession>>;

export type MidaoPageSessionResult =
  | {
      kind: 'ready';
      session: ReadySession;
      impersonation: { guideName: string } | null;
    }
  | {
      kind: 'redirect';
      reason: 'UNAUTHORIZED' | 'SESSION_STALE' | 'MIDAO_DISABLED' | 'BACKEND_MODE_MISMATCH';
      location: string;
    }
  | {
      kind: 'denied';
      reason: 'GUIDE_NOT_ACTIVE';
      status: 403;
    };

export async function resolveMidaoPageSession(
  request: Request,
  options: PageSessionOptions = {},
): Promise<MidaoPageSessionResult> {
  // #1827: production call sites (the shared /midao layout and each leaf
  // page's own redirect boundary, e.g. the legacy-entry route) never pass
  // `options` and rebuild their own Request with the same incoming cookie
  // header, so the two calls are safe to dedupe within one render pass.
  // Tests intentionally pass explicit `runtime`/`flags` overrides on the same
  // cookie to exercise different branches — those calls must bypass the
  // cache entirely so they don't observe a stale memoized result.
  if (options.runtime !== undefined || options.flags !== undefined) {
    return resolveMidaoPageSessionUncached(request, options);
  }
  const cookieHeader = request.headers.get('cookie') || '';
  return resolveMidaoPageSessionByCookie(cookieHeader);
}

const resolveMidaoPageSessionByCookie = cache(async (
  cookieHeader: string,
): Promise<MidaoPageSessionResult> => {
  const request = new Request('http://midao.local/midao', {
    headers: { cookie: cookieHeader },
  });
  return resolveMidaoPageSessionUncached(request, {});
});

async function resolveMidaoPageSessionUncached(
  request: Request,
  options: PageSessionOptions,
): Promise<MidaoPageSessionResult> {
  try {
    const session = await verifyCanonicalGuideSession(request, {
      requireMode: true,
      runtime: options.runtime,
      flags: options.flags,
    });
    return {
      kind: 'ready',
      session,
      impersonation: session.actorType === 'admin' ? { guideName: session.guideName } : null,
    };
  } catch (error) {
    if (!(error instanceof MidaoRuntimeAccessError)) throw error;
    if (error.code === 'UNAUTHORIZED' || error.code === 'SESSION_STALE') {
      return { kind: 'redirect', reason: error.code, location: LOGIN_DESTINATION };
    }
    if (error.code === 'MIDAO_DISABLED' || error.code === 'BACKEND_MODE_MISMATCH') {
      return { kind: 'redirect', reason: error.code, location: LEGACY_DESTINATION };
    }
    if (error.code === 'GUIDE_NOT_ACTIVE') {
      return { kind: 'denied', reason: 'GUIDE_NOT_ACTIVE', status: 403 };
    }
    throw error;
  }
}

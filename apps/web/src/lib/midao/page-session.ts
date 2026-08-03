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

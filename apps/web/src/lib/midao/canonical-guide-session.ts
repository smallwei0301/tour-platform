import { isMidaoBackendEnabled } from '../../config/feature-flags.mjs';
import { getGuideRuntimeAccessDb } from './db-runtime-access.mjs';
import { verifyGuideSession } from '../guide-auth.ts';
import {
  MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME,
  verifyImpersonationActorCookie,
  type ImpersonationActor,
} from './impersonation-actor.ts';

export class MidaoRuntimeAccessError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'MidaoRuntimeAccessError';
    this.code = code;
    this.status = status;
  }
}

export interface CanonicalGuideRuntime {
  guideId: string;
  displayName: string;
  backendMode: string;
  guideSessionVersion: number;
  verificationStatus: string;
}

interface SignedGuideSession {
  guideId: string;
  guideName: string;
  sessionVersion: number;
  sessionKind: 'guide' | 'admin-impersonation';
}

interface ImpersonationState {
  present: boolean;
  actor: ImpersonationActor | null;
}

function deny(code: string, status: number): never {
  throw new MidaoRuntimeAccessError(code, status);
}

function hasCookie(cookieHeader: string, name: string): boolean {
  return String(cookieHeader || '')
    .split(';')
    .some((part) => part.trim().startsWith(`${name}=`));
}

export function assertMidaoRuntimeAccess({
  session,
  runtime,
  flags,
  impersonation,
  requireMode = true,
}: {
  session: SignedGuideSession;
  runtime: CanonicalGuideRuntime | null;
  flags: { backendEnabled: boolean };
  impersonation: ImpersonationState;
  requireMode?: boolean;
}) {
  if (!runtime || runtime.guideId !== session.guideId) deny('UNAUTHORIZED', 401);
  if (
    !Number.isSafeInteger(session.sessionVersion)
    || !Number.isSafeInteger(runtime.guideSessionVersion)
    || session.sessionVersion !== runtime.guideSessionVersion
  ) deny('SESSION_STALE', 401);
  if (runtime.verificationStatus !== 'approved') deny('GUIDE_NOT_ACTIVE', 403);
  if (!flags.backendEnabled) deny('MIDAO_DISABLED', 503);
  if (requireMode && runtime.backendMode !== 'midao') deny('BACKEND_MODE_MISMATCH', 409);

  if (impersonation.present && !impersonation.actor) deny('UNAUTHORIZED', 401);
  const sessionIsImpersonated = session.sessionKind === 'admin-impersonation';
  if (sessionIsImpersonated !== Boolean(impersonation.actor)) deny('UNAUTHORIZED', 401);
  if (impersonation.actor && impersonation.actor.targetGuideId !== runtime.guideId) {
    deny('UNAUTHORIZED', 401);
  }

  return {
    guideId: runtime.guideId,
    guideName: runtime.displayName,
    sessionVersion: runtime.guideSessionVersion,
    backendMode: runtime.backendMode,
    actorType: impersonation.actor ? 'admin' as const : 'guide' as const,
    actorId: impersonation.actor?.actorId ?? runtime.guideId,
  };
}

export async function verifyCanonicalGuideSession(
  request: Request,
  {
    requireMode = true,
    runtime: providedRuntime,
    flags: providedFlags,
  }: {
    requireMode?: boolean;
    runtime?: CanonicalGuideRuntime | null;
    flags?: { backendEnabled: boolean };
  } = {},
) {
  const session = verifyGuideSession(request);
  if (!session) deny('UNAUTHORIZED', 401);

  const runtime = providedRuntime === undefined
    ? await getGuideRuntimeAccessDb({ guideId: session.guideId })
    : providedRuntime;
  const flags = providedFlags ?? { backendEnabled: isMidaoBackendEnabled() };
  const cookieHeader = request.headers.get('cookie') || '';
  const actorPresent = hasCookie(cookieHeader, MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME);
  const actor = actorPresent
    ? verifyImpersonationActorCookie(cookieHeader, { targetGuideId: session.guideId })
    : null;

  return assertMidaoRuntimeAccess({
    session,
    runtime,
    flags,
    impersonation: { present: actorPresent, actor },
    requireMode,
  });
}

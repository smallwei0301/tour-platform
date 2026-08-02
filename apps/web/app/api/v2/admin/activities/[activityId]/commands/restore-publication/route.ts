import type { NextRequest } from 'next/server';
import { getAdminAuthEnv } from '../../../../../../../../src/config/security-env.mjs';
import { isAdminAuthorized, pickAdminCredentials } from '../../../../../../../../src/lib/admin-auth.mjs';
import {
  restoreServicePublication,
  MidaoPublicationRecoveryError,
} from '../../../../../../../../src/lib/admin/midao-publication-recovery.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../../../../../src/lib/admin-session.mjs';
import { jsonError, jsonOk } from '../../../../../../../../src/lib/api-response.ts';
import { validateCsrf } from '../../../../../../../../src/lib/csrf.mjs';
import {
  hashIdempotentRequest,
  parseIdempotencyKey,
} from '../../../../../../../../src/lib/midao/idempotency.ts';
import { MidaoRouteError } from '../../../../../../../../src/lib/midao/route-errors.ts';
import { reportRouteError } from '../../../../../../../../src/lib/route-error.ts';

const ROUTE = 'v2/admin/activities/[activityId]/commands/restore-publication';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type RestorePublicationBody = {
  sourceVersion?: unknown;
};

function authorizeAdmin(request: Pick<NextRequest, 'headers'>) {
  const credentials = pickAdminCredentials(request);
  const security = getAdminSecurityState();
  const { adminAccessToken, adminEmailAllowlist } = getAdminAuthEnv();
  const auth = isAdminAuthorized({
    token: credentials.token,
    email: credentials.email,
    expiresAt: credentials.expiresAt,
    requiredToken: getRequiredAdminToken(adminAccessToken),
    allowlistRaw: adminEmailAllowlist,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion: Number(credentials.sessionVersion || 0),
    requireSession: credentials.requireSession,
  });
  return { auth, actorId: String(credentials.email || '').trim().toLowerCase() };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const { auth, actorId } = authorizeAdmin(request);
  if (!auth.ok) return jsonError('UNAUTHORIZED', auth.reason || 'unauthorized', 401);
  if (!actorId) return jsonError('ADMIN_ACTOR_REQUIRED', 'Admin email is required', 401);

  const csrf = validateCsrf(request);
  if (csrf) {
    const payload = await csrf.clone().json().catch(() => null);
    const code = String((payload as { error?: { code?: unknown } })?.error?.code ?? 'CSRF_INVALID');
    const message = String((payload as { error?: { message?: unknown } })?.error?.message ?? 'Invalid CSRF token');
    return jsonError(code, message, csrf.status || 403);
  }

  const activityId = String((await params).activityId || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(activityId)) {
    return jsonError('INVALID_ACTIVITY_ID', 'activityId 必須是 UUID 格式', 422);
  }

  let body: RestorePublicationBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('INVALID_REQUEST_BODY', 'Invalid JSON request body', 422);
  }
  if (
    !body
    || typeof body !== 'object'
    || Array.isArray(body)
    || Object.getPrototypeOf(body) !== Object.prototype
    || JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(['sourceVersion'])
  ) {
    return jsonError('INVALID_REQUEST_BODY', 'Only sourceVersion is allowed', 422);
  }
  if (
    typeof body.sourceVersion !== 'number'
    || !Number.isInteger(body.sourceVersion)
    || body.sourceVersion < 1
  ) {
    return jsonError('INVALID_SOURCE_VERSION', 'sourceVersion 必須是大於零的整數', 422);
  }
  let idempotencyKey: string;
  try {
    idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'));
  } catch (error) {
    if (error instanceof MidaoRouteError) {
      return jsonError(error.code, error.message, error.status);
    }
    await reportRouteError(error, { route: ROUTE });
    return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
  }
  const requestHash = hashIdempotentRequest({ sourceVersion: body.sourceVersion });

  try {
    const result = await restoreServicePublication({
      activityId,
      sourceVersion: body.sourceVersion,
      actorId,
      idempotencyKey,
      requestHash,
    });
    return jsonOk(result);
  } catch (error) {
    if (error instanceof MidaoPublicationRecoveryError) {
      const recoveryError = error as unknown as { code: string; status: number };
      return jsonError(recoveryError.code, recoveryError.code, recoveryError.status);
    }
    await reportRouteError(error, { route: ROUTE });
    return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
  }
}

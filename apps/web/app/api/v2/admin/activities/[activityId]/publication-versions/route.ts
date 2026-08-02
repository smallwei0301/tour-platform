import type { NextRequest } from 'next/server';
import { getAdminAuthEnv } from '../../../../../../../src/config/security-env.mjs';
import { isAdminAuthorized, pickAdminCredentials } from '../../../../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../../../../src/lib/admin-session.mjs';
import {
  listServicePublicationVersions,
  MidaoPublicationRecoveryError,
} from '../../../../../../../src/lib/admin/midao-publication-recovery.mjs';
import { jsonError, jsonOk } from '../../../../../../../src/lib/api-response.ts';
import { reportRouteError } from '../../../../../../../src/lib/route-error.ts';

const ROUTE = 'v2/admin/activities/[activityId]/publication-versions';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function checkAdminAuth(request: Pick<NextRequest, 'headers'>): { ok: boolean; reason?: string } {
  const { token, email, expiresAt, sessionVersion, requireSession } = pickAdminCredentials(request);
  const security = getAdminSecurityState();
  const { adminAccessToken, adminEmailAllowlist } = getAdminAuthEnv();
  return isAdminAuthorized({
    token,
    email,
    expiresAt,
    requiredToken: getRequiredAdminToken(adminAccessToken),
    allowlistRaw: adminEmailAllowlist,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion: Number(sessionVersion || 0),
    requireSession,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const auth = checkAdminAuth(request);
  if (!auth.ok) return jsonError('UNAUTHORIZED', auth.reason || 'unauthorized', 401);

  const activityId = String((await params).activityId || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(activityId)) {
    return jsonError('INVALID_ACTIVITY_ID', 'activityId 必須是 UUID 格式', 422);
  }

  try {
    return jsonOk(await listServicePublicationVersions(activityId));
  } catch (error) {
    if (error instanceof MidaoPublicationRecoveryError) {
      const recoveryError = error as unknown as { code: string; status: number };
      return jsonError(recoveryError.code, recoveryError.code, recoveryError.status);
    }
    await reportRouteError(error, { route: ROUTE });
    return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
  }
}

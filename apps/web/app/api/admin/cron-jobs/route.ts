import { ok, fail } from '../../../../src/lib/api.ts';
import { isAdminAuthorized, pickAdminCredentials } from '../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../src/lib/admin-session.mjs';
import { GithubAdminError, listCronJobsForAdmin, setGithubWorkflowEnabled } from '../../../../src/lib/admin/go-no-go-schedules.mjs';

export const dynamic = 'force-dynamic';

function checkAdminAuth(request: Request) {
  const { token, email, expiresAt, sessionVersion, requireSession } = pickAdminCredentials(request);
  const security = getAdminSecurityState();
  return isAdminAuthorized({
    token,
    email,
    expiresAt,
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion: Number(sessionVersion || 0),
    requireSession,
  });
}

function errorResponse(err: unknown) {
  if (err instanceof GithubAdminError) {
    return Response.json(fail(err.code, err.message), { status: err.status });
  }

  const message = err instanceof Error ? err.message : 'unknown error';
  return Response.json(fail('SERVER_ERROR', message), { status: 500 });
}

export async function GET(request: Request) {
  const auth = checkAdminAuth(request);
  if (!auth.ok) {
    return Response.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  try {
    const data = await listCronJobsForAdmin();
    return Response.json(ok({
      jobs: data.jobs,
      repoSlug: data.repoSlug,
      hasGithubToken: data.hasGithubToken,
      githubConnection: data.githubConnection,
    }));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request) {
  const auth = checkAdminAuth(request);
  if (!auth.ok) {
    return Response.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { jobKey, enabled } = body ?? {};

  if (typeof jobKey !== 'string' || typeof enabled !== 'boolean') {
    return Response.json(fail('BAD_REQUEST', 'jobKey 與 enabled 為必填欄位'), { status: 400 });
  }

  try {
    const actor = pickAdminCredentials(request).email || 'admin';
    const result = await setGithubWorkflowEnabled({
      jobKey,
      enabled,
      actor,
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    return Response.json(ok(result));
  } catch (err) {
    return errorResponse(err);
  }
}

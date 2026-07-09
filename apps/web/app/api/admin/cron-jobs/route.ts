import { ok, fail } from '../../../../src/lib/api';
import { listCronJobsForAdmin, setGithubWorkflowEnabled } from '../../../../src/lib/go-no-go-schedules.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await listCronJobsForAdmin();
    return Response.json(ok({ jobs: data.jobs, repoSlug: data.repoSlug, hasGithubToken: data.hasGithubToken }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { jobKey, enabled } = body ?? {};

  if (typeof jobKey !== 'string' || typeof enabled !== 'boolean') {
    return Response.json(fail('BAD_REQUEST', 'jobKey 與 enabled 為必填欄位'), { status: 400 });
  }

  try {
    const result = await setGithubWorkflowEnabled({ jobKey, enabled });
    return Response.json(ok(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

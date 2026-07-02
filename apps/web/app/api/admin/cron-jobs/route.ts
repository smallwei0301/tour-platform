/**
 * GET  /api/admin/cron-jobs — 排程工作流列表（registry + 開關狀態 + 最近執行紀錄）
 * PATCH /api/admin/cron-jobs — 切換單一 job 開關 { jobKey, enabled, reason? }
 *
 * Authentication: admin cookie session（isAdminAuthorized pattern）。
 * 開關為 DB-backed kill switch：endpoint 於下一次觸發時生效（workflow 仍會
 * 發請求，endpoint no-op 回 skipped_by_admin）。排程「時間」唯讀 —
 * 改時間需改 .github/workflows/*.yml（owner 決策 2026-07-02，選項 A）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { isAdminAuthorized, pickAdminCredentials } from '../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../src/lib/admin-session.mjs';
import { appendAuditLog } from '../../../../src/lib/audit-log.mjs';
import {
  CRON_JOBS,
  CRON_JOB_KEYS,
  getCronJobControls,
  listRecentCronRuns,
  setCronJobControl,
} from '../../../../src/lib/cron-job-controls.mjs';

export const dynamic = 'force-dynamic';

const GITHUB_REPO_URL = 'https://github.com/smallwei0301/tour-platform';

function checkAdminAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const { token, email, expiresAt, sessionVersion, requireSession } = pickAdminCredentials(req);
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

export async function GET(req: NextRequest) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }
  try {
    const [controls, runs] = (await Promise.all([getCronJobControls(), listRecentCronRuns({ perJob: 5 })])) as [
      Record<string, unknown>,
      Record<string, unknown[]>,
    ];
    const jobs = CRON_JOBS.map((job) => ({
      ...job,
      workflowUrl: `${GITHUB_REPO_URL}/actions/workflows/${job.workflowFile}`,
      control: controls[job.jobKey],
      recentRuns: runs[job.jobKey] ?? [],
    }));
    return NextResponse.json(ok({ jobs }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const jobKey = typeof body?.jobKey === 'string' ? body.jobKey : '';
    const enabled = body?.enabled;
    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 300) : null;
    if (!CRON_JOB_KEYS.includes(jobKey) || typeof enabled !== 'boolean') {
      return NextResponse.json(fail('BAD_REQUEST', 'jobKey 或 enabled 無效'), { status: 400 });
    }
    const { email } = pickAdminCredentials(req);
    const actor = email || 'admin';
    const result = await setCronJobControl({ jobKey, enabled, actor, reason });
    if (!result.ok) {
      return NextResponse.json(fail('SERVER_ERROR', result.error || 'set control failed'), { status: 500 });
    }
    // 開關本身已在 cron_job_controls 留 updated_by/reason/updated_at；
    // 這裡再補一筆 audit log 供統一稽核流查詢。
    appendAuditLog({
      actor,
      action: 'cron_job_control_toggle',
      metadata: { jobKey, enabled, reason },
    });
    const controls = (await getCronJobControls()) as Record<string, unknown>;
    return NextResponse.json(ok({ jobKey, control: controls[jobKey] }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

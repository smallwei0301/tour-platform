import path from 'node:path';

import { insertAuditLogDb } from '../audit-log.mjs';
import { getSupabase } from '../supabase-env.mjs';

const DISABLE_EFFECT_ZH = '停用後 GitHub Actions workflow 不會再執行，因此不會再發 Telegram / Email 通知。';

export const SCHEDULE_REGISTRY = [
  {
    jobKey: 'refund-reconcile',
    workflowName: 'refund-reconcile',
    workflowPath: '.github/workflows/refund-reconcile.yml',
    cron: '0 * * * *',
    scheduleZh: '每小時整點（UTC）／台灣時間每小時 +00',
    labelZh: '退款補帳對帳',
    summaryZh: '補做退款對帳，修正 callback 漏接或退款狀態卡住。',
    riskLevelZh: '可降頻',
    riskReasonZh: '主路徑仍靠即時 callback；降頻只會讓補帳與告警變慢。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'pre-tour-reminder-sweep',
    workflowName: 'pre-tour-reminder-sweep',
    workflowPath: '.github/workflows/pre-tour-reminder-sweep.yml',
    cron: '0 * * * *',
    scheduleZh: '每小時整點（UTC）／台灣時間每小時 +00',
    labelZh: '行前提醒掃描',
    summaryZh: '掃描即將出團訂單，寄送行前提醒。',
    riskLevelZh: '不能直接降頻',
    riskReasonZh: 'h1 / h24 提醒視窗靠每小時掃描完整覆蓋，降太多可能漏發提醒。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'ecpay-failure-sweep',
    workflowName: 'ecpay-failure-sweep',
    workflowPath: '.github/workflows/ecpay-failure-sweep.yml',
    cron: '15 * * * *',
    scheduleZh: '每小時 15 分（UTC）／台灣時間每小時 +15',
    labelZh: 'ECPay 失敗告警掃描',
    summaryZh: '掃近 60 分鐘 ECPay callback 失敗，超門檻時建立 incident 告警。',
    riskLevelZh: '不能直接降頻',
    riskReasonZh: '現在只回看最近 60 分鐘；若改成更疏的排程，監控會出現盲區。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'readiness-snapshot-refresh',
    workflowName: 'Readiness Snapshot Refresh',
    workflowPath: '.github/workflows/readiness-snapshot-refresh.yml',
    cron: '0 */6 * * *',
    scheduleZh: '每 6 小時（UTC）／台灣時間 02:00、08:00、14:00、20:00',
    labelZh: 'Readiness 快照刷新',
    summaryZh: '自動更新 readiness live-state 報告與 freshness 檢查。',
    riskLevelZh: '可降頻',
    riskReasonZh: '只影響文件快照新鮮度，不影響交易正確性。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'e2e-smoke',
    workflowName: 'e2e-smoke',
    workflowPath: '.github/workflows/e2e-smoke.yml',
    cron: '0 2 * * *',
    scheduleZh: '每日 02:00 UTC／台灣時間 10:00',
    labelZh: '瀏覽器 smoke 測試',
    summaryZh: '每天跑一輪小型 Playwright smoke，抓瀏覽器層回歸。',
    riskLevelZh: '可降頻',
    riskReasonZh: '降頻只會延後發現前台互動回歸，不會直接影響既有訂單鏈。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'settlement-sweep',
    workflowName: 'settlement-sweep',
    workflowPath: '.github/workflows/settlement-sweep.yml',
    cron: '0 2 * * *',
    scheduleZh: '每日 02:00 UTC／台灣時間 10:00',
    labelZh: '結算與出款單生成',
    summaryZh: '先做 completed 訂單結算，再生成達門檻的 pending payout。',
    riskLevelZh: '低風險維持現狀',
    riskReasonZh: '目前已是日級批次；再降頻只會讓結算與出款更晚。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'availability-snapshot-reconcile',
    workflowName: 'availability-snapshot-reconcile',
    workflowPath: '.github/workflows/availability-snapshot-reconcile.yml',
    cron: '20 2 * * *',
    scheduleZh: '每日 02:20 UTC／台灣時間 10:20',
    labelZh: '可售快照回補',
    summaryZh: '回補 availability snapshot，修正可售快照與真實資料偏差。',
    riskLevelZh: '低風險維持現狀',
    riskReasonZh: '已是每日批次，成本低；停用只會讓快照落後。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'ecpay-reconcile',
    workflowName: 'ecpay-reconcile',
    workflowPath: '.github/workflows/ecpay-reconcile.yml',
    cron: '30 3 * * *',
    scheduleZh: '每日 03:30 UTC／台灣時間 11:30',
    labelZh: 'ECPay 付款補對帳',
    summaryZh: '補做 pending 付款對帳，修正 callback 漏接造成的付款狀態卡住。',
    riskLevelZh: '低風險維持現狀',
    riskReasonZh: '目前已每日一次，成本低；停用會讓卡住付款更久才被修正。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'rls-grants-preflight',
    workflowName: 'rls-grants-preflight',
    workflowPath: '.github/workflows/rls-grants-preflight.yml',
    cron: '0 3 * * 1',
    scheduleZh: '每週一 03:00 UTC／台灣時間每週一 11:00',
    labelZh: 'RLS / grants 預檢',
    summaryZh: '每週檢查資料表 RLS 與 grants 是否符合安全預期。',
    riskLevelZh: '低風險維持現狀',
    riskReasonZh: '已是每週一次；停用只會讓權限漂移更晚被發現。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'migration-drift-detect',
    workflowName: 'migration-drift-detect',
    workflowPath: '.github/workflows/migration-drift-detect.yml',
    cron: '0 4 * * *',
    scheduleZh: '每日 04:00 UTC／台灣時間 12:00',
    labelZh: 'migration drift 偵測',
    summaryZh: '比對 production schema 與 migration 預期，抓直接改 DB 的漂移。',
    riskLevelZh: '可降頻',
    riskReasonZh: '降頻只會延後發現 schema 漂移，不直接影響已上線交易。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'review-invitation-sweep',
    workflowName: 'review-invitation-sweep',
    workflowPath: '.github/workflows/review-invitation-sweep.yml',
    cron: '0 10 * * *',
    scheduleZh: '每日 10:00 UTC／台灣時間 18:00',
    labelZh: '評價邀請掃描',
    summaryZh: '出團後寄送評價邀請，拉動旅客留評。',
    riskLevelZh: '低風險維持現狀',
    riskReasonZh: '已是每日一次；停用主要影響評價收集，不影響支付鏈。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'public-booking-audit',
    workflowName: 'Public Booking V2 Audit',
    workflowPath: '.github/workflows/public-booking-audit.yml',
    cron: '0 17 * * *',
    scheduleZh: '每日 17:00 UTC／台灣時間隔日 01:00',
    labelZh: '公開 Booking V2 稽核',
    summaryZh: '巡檢已上架活動對 Booking V2 API 的公開可訂狀態。',
    riskLevelZh: '低風險維持現狀',
    riskReasonZh: '屬每日稽核，成本低；停用會少一層公開可訂巡檢。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'unpaid-expiry-sweep',
    workflowName: 'unpaid-expiry-sweep',
    workflowPath: '.github/workflows/unpaid-expiry-sweep.yml',
    cron: '0 18 * * *',
    scheduleZh: '每日 18:00 UTC／台灣時間隔日 02:00',
    labelZh: '逾期未付款清理',
    summaryZh: '把逾時未付款訂單補做取消、釋放名額並寄取消通知。',
    riskLevelZh: '低風險維持現狀',
    riskReasonZh: '目前只是每日兜底；停用後補清理會消失，但即時讀取過濾仍在。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'auto-complete-sweep',
    workflowName: 'auto-complete-sweep',
    workflowPath: '.github/workflows/auto-complete-sweep.yml',
    cron: '30 18 * * *',
    scheduleZh: '每日 18:30 UTC／台灣時間隔日 02:30',
    labelZh: '訂單自動完成兜底',
    summaryZh: '把已出團超過寬限期仍 confirmed 的訂單補轉 completed。',
    riskLevelZh: '低風險維持現狀',
    riskReasonZh: '屬日級兜底；停用會讓 settlement / review invitation 吃不到補完單。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'anon-rls-probe',
    workflowName: 'anon-rls-probe',
    workflowPath: '.github/workflows/anon-rls-probe.yml',
    cron: '0 19 * * *',
    scheduleZh: '每日 19:00 UTC／台灣時間隔日 03:00',
    labelZh: 'anon RLS 外洩探測',
    summaryZh: '用公開 anon key 實際探測敏感表是否外洩。',
    riskLevelZh: '低風險維持現狀',
    riskReasonZh: '屬安全偵測；停用會讓 RLS 外洩更晚被抓到。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'booking-v2-daily-go-no-go',
    workflowName: 'booking-v2-daily-go-no-go',
    workflowPath: '.github/workflows/booking-v2-daily-go-no-go.yml',
    cron: '30 1 * * *',
    scheduleZh: '每日 01:30 UTC／台灣時間 09:30',
    labelZh: 'Booking V2 每日 Go/No-Go 報告',
    summaryZh: '每天生成 Booking V2 dashboard + Go/No-Go 決策報告。',
    riskLevelZh: '低風險維持現狀',
    riskReasonZh: '成本低；停用會讓 rollout 決策少一份日報。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
];

const REGISTRY_BY_KEY = new Map(SCHEDULE_REGISTRY.map((item) => [item.jobKey, item]));
const REGISTRY_BY_PATH = new Map(SCHEDULE_REGISTRY.map((item) => [item.workflowPath, item]));

export function getGithubRepoSlug() {
  return process.env.GITHUB_ACTIONS_REPO || process.env.GITHUB_REPOSITORY || 'smallwei0301/tour-platform';
}

export function getGithubActionsToken() {
  return process.env.GITHUB_ACTIONS_ADMIN_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
}

const TEST_HOOKS = {
  fetchImpl: null,
  auditLogger: null,
  now: null,
};

export class GithubAdminError extends Error {
  constructor(code, status, message, details = {}) {
    super(message);
    this.name = 'GithubAdminError';
    this.code = code;
    this.status = status;
    this.connectionStatus = details.connectionStatus || 'transient_error';
    this.canRead = details.canRead ?? false;
    this.canWrite = details.canWrite ?? false;
    this.retryable = details.retryable ?? false;
    this.operatorAction = details.operatorAction || 'retry_later';
    this.retryAfterSeconds = details.retryAfterSeconds ?? null;
  }
}

function createGithubConnection(overrides = {}) {
  return {
    status: 'ready',
    canRead: true,
    canWrite: true,
    retryable: false,
    operatorAction: 'none',
    retryAfterSeconds: null,
    ...overrides,
  };
}

function githubConnectionFromError(err) {
  if (err instanceof GithubAdminError) {
    return createGithubConnection({
      status: err.connectionStatus,
      canRead: err.canRead,
      canWrite: err.canWrite,
      retryable: err.retryable,
      operatorAction: err.operatorAction,
      retryAfterSeconds: err.retryAfterSeconds,
    });
  }

  return createGithubConnection({
    status: 'transient_error',
    canRead: false,
    canWrite: false,
    retryable: true,
    operatorAction: 'retry_later',
  });
}

export function __setGoNoGoTestHooks(hooks = {}) {
  TEST_HOOKS.fetchImpl = hooks.fetchImpl || null;
  TEST_HOOKS.auditLogger = hooks.auditLogger || null;
  TEST_HOOKS.now = hooks.now || null;
}

export function __resetGoNoGoTestHooks() {
  TEST_HOOKS.fetchImpl = null;
  TEST_HOOKS.auditLogger = null;
  TEST_HOOKS.now = null;
}

function pickFetchImpl(override) {
  return override || TEST_HOOKS.fetchImpl || fetch;
}

async function writeScheduleAuditToDb(entry) {
  const supabase = await getSupabase();
  await insertAuditLogDb(supabase, entry);
  return null;
}

function pickAuditLogger(override) {
  return override || TEST_HOOKS.auditLogger || writeScheduleAuditToDb;
}

function pickNow(override) {
  return override || TEST_HOOKS.now || (() => new Date().toISOString());
}

function getWorkflowFileName(workflowPath) {
  return path.basename(workflowPath);
}

function workflowActionsUrl(repoSlug, workflowPath) {
  return `https://github.com/${repoSlug}/actions/workflows/${getWorkflowFileName(workflowPath)}`;
}

function workflowStateLabelZh(state) {
  if (state === 'active') return '已啟用';
  if (state === 'disabled_manually') return '已停用';
  if (state === 'deleted') return '已刪除';
  if (state === 'archived') return '已封存';
  if (state === 'token_missing') return '缺 GitHub Token';
  if (state === 'workflow_unmatched' || state === 'unmatched') return 'GitHub 未對上';
  if (state === 'unknown') return 'GitHub 狀態未知';
  return state || '未知';
}

function normalizeGithubWorkflow(workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    path: workflow.path,
    state: workflow.state,
    html_url: workflow.html_url,
  };
}

export function buildScheduleViewModels({
  githubWorkflows = [],
  hasGithubToken = false,
  repoSlug = getGithubRepoSlug(),
  githubConnection = createGithubConnection({
    status: hasGithubToken ? 'ready' : 'missing',
    canRead: hasGithubToken,
    canWrite: hasGithubToken,
    operatorAction: hasGithubToken ? 'none' : 'configure_credential',
  }),
} = {}) {
  const liveByPath = new Map(githubWorkflows.map((item) => [item.path, normalizeGithubWorkflow(item)]));
  const connectionReady = githubConnection.status === 'ready';

  return SCHEDULE_REGISTRY.map((item) => {
    const workflow = liveByPath.get(item.workflowPath);
    const state = workflow?.state || (connectionReady ? 'workflow_unmatched' : hasGithubToken ? 'unknown' : 'token_missing');
    const enabled = workflow ? workflow.state === 'active' : false;
    return {
      ...item,
      workflowFile: getWorkflowFileName(item.workflowPath),
      workflowUrl: workflow?.html_url || workflowActionsUrl(repoSlug, item.workflowPath),
      github: {
        id: workflow?.id ?? null,
        name: workflow?.name ?? item.workflowName,
        state,
        stateLabelZh: workflowStateLabelZh(state),
        enabled,
        matched: !!workflow,
        canToggle: connectionReady && githubConnection.canWrite && !!workflow,
      },
    };
  });
}

function parseRetryAfterSeconds(response) {
  const raw = response.headers.get('retry-after');
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function classifyGithubHttpError(response) {
  const retryAfterSeconds = parseRetryAfterSeconds(response);
  const remaining = response.headers.get('x-ratelimit-remaining');
  const rateLimited = response.status === 429 || (response.status === 403 && (remaining === '0' || retryAfterSeconds !== null));

  if (response.status === 401) {
    return new GithubAdminError('GITHUB_CREDENTIAL_INVALID', 503, 'GitHub credential invalid or revoked', {
      connectionStatus: 'invalid_or_revoked',
      canRead: false,
      canWrite: false,
      operatorAction: 'rotate_credential',
    });
  }

  if (rateLimited) {
    return new GithubAdminError('GITHUB_RATE_LIMITED', 503, 'GitHub rate limited the request', {
      connectionStatus: 'rate_limited',
      canRead: false,
      canWrite: false,
      retryable: true,
      operatorAction: 'retry_later',
      retryAfterSeconds,
    });
  }

  if (response.status === 403) {
    return new GithubAdminError('GITHUB_PERMISSION_DENIED', 503, 'GitHub Actions permission denied', {
      connectionStatus: 'insufficient_permission',
      canRead: false,
      canWrite: false,
      operatorAction: 'grant_actions_write',
    });
  }

  if (response.status === 404) {
    return new GithubAdminError('GITHUB_REPO_MISMATCH', 503, 'GitHub repository or workflow mapping mismatch', {
      connectionStatus: 'repo_mismatch',
      canRead: false,
      canWrite: false,
      operatorAction: 'verify_repo',
    });
  }

  return new GithubAdminError('GITHUB_TRANSIENT', 503, 'GitHub temporarily unavailable', {
    connectionStatus: 'transient_error',
    canRead: false,
    canWrite: false,
    retryable: true,
    operatorAction: 'retry_later',
    retryAfterSeconds,
  });
}

async function githubApi(pathname, { method = 'GET', body, fetchImpl } = {}) {
  const token = getGithubActionsToken();
  if (!token) {
    throw new GithubAdminError('GITHUB_CREDENTIAL_MISSING', 503, 'GitHub Actions admin credential is not configured', {
      connectionStatus: 'missing',
      canRead: false,
      canWrite: false,
      operatorAction: 'configure_credential',
    });
  }

  let response;
  try {
    response = await pickFetchImpl(fetchImpl)(`https://api.github.com${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new GithubAdminError('GITHUB_TRANSIENT', 503, 'GitHub temporarily unavailable', {
      connectionStatus: 'transient_error',
      canRead: false,
      canWrite: false,
      retryable: true,
      operatorAction: 'retry_later',
    });
  }

  if (!response.ok) {
    throw classifyGithubHttpError(response);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function fetchGithubWorkflows(options = {}) {
  const repoSlug = getGithubRepoSlug();
  const data = await githubApi(`/repos/${repoSlug}/actions/workflows?per_page=100`, { fetchImpl: options.fetchImpl });
  return {
    repoSlug,
    workflows: (data?.workflows || []).map(normalizeGithubWorkflow),
  };
}

export async function listCronJobsForAdmin(options = {}) {
  const token = getGithubActionsToken();
  const repoSlug = getGithubRepoSlug();
  if (!token) {
    const githubConnection = createGithubConnection({
      status: 'missing',
      canRead: false,
      canWrite: false,
      operatorAction: 'configure_credential',
    });
    return {
      repoSlug,
      hasGithubToken: false,
      githubConnection,
      jobs: buildScheduleViewModels({ hasGithubToken: false, repoSlug, githubConnection }),
    };
  }

  try {
    const { workflows } = await fetchGithubWorkflows(options);
    const githubConnection = createGithubConnection();
    return {
      repoSlug,
      hasGithubToken: true,
      githubConnection,
      jobs: buildScheduleViewModels({ githubWorkflows: workflows, hasGithubToken: true, repoSlug, githubConnection }),
    };
  } catch (err) {
    if (!(err instanceof GithubAdminError)) throw err;
    const githubConnection = githubConnectionFromError(err);
    return {
      repoSlug,
      hasGithubToken: true,
      githubConnection,
      jobs: buildScheduleViewModels({ hasGithubToken: true, repoSlug, githubConnection }),
    };
  }
}

function expectedWorkflowState(enabled) {
  return enabled ? 'active' : 'disabled_manually';
}

async function writeScheduleAudit({ auditLogger, actor, now, metadata }) {
  return Promise.resolve(auditLogger({
    actor,
    action: 'admin_go_no_go_schedule_toggle',
    metadata: {
      ...metadata,
      timestamp: now(),
    },
  }));
}

export async function setGithubWorkflowEnabled({
  jobKey,
  enabled,
  actor = 'admin',
  requestId = null,
  fetchImpl,
  auditLogger,
  now,
}) {
  const item = REGISTRY_BY_KEY.get(jobKey);
  if (!item) {
    throw new GithubAdminError('BAD_REQUEST', 400, `Unknown jobKey: ${jobKey}`, {
      connectionStatus: 'ready',
      canRead: true,
      canWrite: true,
      operatorAction: 'none',
    });
  }

  const repoSlug = getGithubRepoSlug();
  const resolvedAuditLogger = pickAuditLogger(auditLogger);
  const resolvedNow = pickNow(now);
  const { workflows: beforeWorkflows } = await fetchGithubWorkflows({ fetchImpl });
  const beforeWorkflow = beforeWorkflows.find((workflow) => workflow.path === item.workflowPath);
  if (!beforeWorkflow) {
    throw new GithubAdminError('GITHUB_WORKFLOW_UNMATCHED', 409, 'GitHub workflow path is not matched in the registry', {
      connectionStatus: 'ready',
      canRead: true,
      canWrite: true,
      operatorAction: 'verify_repo',
    });
  }

  const beforeState = beforeWorkflow.state;
  try {
    await writeScheduleAudit({
      auditLogger: resolvedAuditLogger,
      actor,
      now: resolvedNow,
      metadata: {
        phase: 'intent',
        outcome: 'pending',
        errorClass: null,
        requestId,
        repoSlug,
        jobKey,
        workflowPath: item.workflowPath,
        workflowName: item.workflowName,
        requestedEnabled: !!enabled,
        beforeState,
        afterState: null,
      },
    });
  } catch {
    throw new GithubAdminError('AUDIT_WRITE_FAILED', 500, 'Failed to write Go/No-Go audit intent', {
      connectionStatus: 'ready',
      canRead: true,
      canWrite: true,
      operatorAction: 'retry_later',
    });
  }

  const workflowId = getWorkflowFileName(item.workflowPath);
  const action = enabled ? 'enable' : 'disable';
  await githubApi(`/repos/${repoSlug}/actions/workflows/${workflowId}/${action}`, { method: 'PUT', fetchImpl });

  const { workflows: afterWorkflows } = await fetchGithubWorkflows({ fetchImpl });
  const afterWorkflow = afterWorkflows.find((workflow) => workflow.path === item.workflowPath);
  const afterState = afterWorkflow?.state || 'workflow_unmatched';
  if (afterState !== expectedWorkflowState(enabled)) {
    try {
      await writeScheduleAudit({
        auditLogger: resolvedAuditLogger,
        actor,
        now: resolvedNow,
        metadata: {
          phase: 'final',
          outcome: 'failed',
          errorClass: 'verification_failed',
          requestId,
          repoSlug,
          jobKey,
          workflowPath: item.workflowPath,
          workflowName: item.workflowName,
          requestedEnabled: !!enabled,
          beforeState,
          afterState,
        },
      });
    } catch {
      // Verification failure is already fail-closed; keep the original contract.
    }

    throw new GithubAdminError('GITHUB_STATE_VERIFICATION_FAILED', 503, 'GitHub workflow state verification failed', {
      connectionStatus: 'ready',
      canRead: true,
      canWrite: true,
      retryable: true,
      operatorAction: 'retry_later',
    });
  }

  try {
    await writeScheduleAudit({
      auditLogger: resolvedAuditLogger,
      actor,
      now: resolvedNow,
      metadata: {
        phase: 'final',
        outcome: 'success',
        errorClass: null,
        requestId,
        repoSlug,
        jobKey,
        workflowPath: item.workflowPath,
        workflowName: item.workflowName,
        requestedEnabled: !!enabled,
        beforeState,
        afterState,
      },
    });
  } catch {
    throw new GithubAdminError('AUDIT_FINALIZATION_FAILED', 500, 'Failed to finalize Go/No-Go audit record', {
      connectionStatus: 'ready',
      canRead: true,
      canWrite: true,
      operatorAction: 'retry_later',
    });
  }

  return {
    jobKey,
    requestedEnabled: !!enabled,
    beforeState,
    afterState,
    workflowPath: item.workflowPath,
    workflowName: item.workflowName,
  };
}

export function getScheduleDefinition(jobKey) {
  return REGISTRY_BY_KEY.get(jobKey) || null;
}

export function getScheduleDefinitionByPath(workflowPath) {
  return REGISTRY_BY_PATH.get(workflowPath) || null;
}

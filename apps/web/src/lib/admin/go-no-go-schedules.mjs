import path from 'node:path';

const DISABLE_EFFECT_ZH = '停用後 GitHub Actions workflow 不會再執行，因此不會再發 Telegram / Email 通知。';

export const SCHEDULE_REGISTRY = [
  {
    jobKey: 'refund-reconcile',
    workflowName: 'refund-reconcile',
    workflowPath: '.github/workflows/refund-reconcile.yml',
    cron: '0 3 * * *',
    scheduleZh: '每日 03:00 UTC／台灣時間 11:00',
    labelZh: '退款補帳對帳',
    summaryZh: '補做退款對帳，修正 callback 漏接或退款狀態卡住。',
    riskLevelZh: '已降為每日',
    riskReasonZh: '主路徑仍靠即時 callback；已由每小時降為每日，逐筆冪等，補帳延後至多一天可接受。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'pre-tour-reminder-sweep',
    workflowName: 'pre-tour-reminder-sweep',
    workflowPath: '.github/workflows/pre-tour-reminder-sweep.yml',
    cron: '0 22 * * *',
    scheduleZh: '每日 22:00 UTC／台灣時間隔日 06:00',
    labelZh: '行前提醒掃描',
    summaryZh: '掃描即將出團訂單，寄送行前提醒（行前一日＋當日出發）。',
    riskLevelZh: '已改邏輯降為每日',
    riskReasonZh: '已改為每日雙視窗（行前一日 [+24h,+48h)、當日出發 [0,+24h) 各涵蓋 24 小時），相接不重不漏；提醒改為每日晨間發送。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'ecpay-failure-sweep',
    workflowName: 'ecpay-failure-sweep',
    workflowPath: '.github/workflows/ecpay-failure-sweep.yml',
    cron: '15 3 * * *',
    scheduleZh: '每日 03:15 UTC／台灣時間 11:15',
    labelZh: 'ECPay 失敗告警掃描',
    summaryZh: '掃近 24 小時 ECPay callback 失敗，超門檻時建立 incident 告警。',
    riskLevelZh: '已改邏輯降為每日',
    riskReasonZh: '回看窗已由 60 分鐘改為 24 小時，隨每日排程完整涵蓋無盲區；告警最多延後一天。',
    disableEffectZh: DISABLE_EFFECT_ZH,
  },
  {
    jobKey: 'readiness-snapshot-refresh',
    workflowName: 'Readiness Snapshot Refresh',
    workflowPath: '.github/workflows/readiness-snapshot-refresh.yml',
    cron: '0 5 * * *',
    scheduleZh: '每日 05:00 UTC／台灣時間 13:00',
    labelZh: 'Readiness 快照刷新',
    summaryZh: '自動更新 readiness live-state 報告與 freshness 檢查。',
    riskLevelZh: '已降為每日',
    riskReasonZh: '已由每 6 小時降為每日；只影響文件快照新鮮度，不影響交易正確性。',
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
  if (state === 'unmatched') return 'GitHub 未對上';
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

function runConclusionLabelZh(run) {
  if (!run) return '尚無紀錄';
  if (run.status && run.status !== 'completed') {
    if (run.status === 'in_progress') return '執行中';
    if (run.status === 'queued') return '排隊中';
    return '執行中';
  }
  switch (run.conclusion) {
    case 'success':
      return '成功';
    case 'failure':
      return '失敗';
    case 'cancelled':
      return '已取消';
    case 'skipped':
      return '略過';
    case 'timed_out':
      return '逾時';
    case 'startup_failure':
      return '啟動失敗';
    default:
      return run.conclusion || '未知';
  }
}

function normalizeGithubRun(run) {
  // 最後執行時間優先取 run_started_at（實際開跑時間），退回 created_at。
  const startedAt = run.run_started_at || run.created_at || null;
  return {
    startedAt,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    conclusionLabelZh: runConclusionLabelZh(run),
    url: run.html_url ?? null,
  };
}

/**
 * 從近期 workflow runs 取「每支 workflow 最近一次」的 run。
 * GitHub runs API 預設依建立時間新到舊排序，故每個 path 第一次出現即最新。
 */
export function pickLatestRunsByPath(runs = []) {
  const latestByPath = new Map();
  const latestById = new Map();
  for (const run of runs) {
    if (run.path && !latestByPath.has(run.path)) latestByPath.set(run.path, run);
    if (run.workflow_id != null && !latestById.has(run.workflow_id)) latestById.set(run.workflow_id, run);
  }
  return { latestByPath, latestById };
}

export function buildScheduleViewModels({
  githubWorkflows = [],
  githubRuns = [],
  hasGithubToken = false,
  repoSlug = getGithubRepoSlug(),
} = {}) {
  const liveByPath = new Map(githubWorkflows.map((item) => [item.path, normalizeGithubWorkflow(item)]));
  const { latestByPath, latestById } = pickLatestRunsByPath(githubRuns);

  return SCHEDULE_REGISTRY.map((item) => {
    const workflow = liveByPath.get(item.workflowPath);
    const state = workflow?.state || (hasGithubToken ? 'unmatched' : 'token_missing');
    const enabled = workflow ? workflow.state === 'active' : false;
    // 先用 path 對，退回用 workflow id 對（極少數 path 改名情境）。
    const rawRun =
      latestByPath.get(item.workflowPath) ||
      (workflow?.id != null ? latestById.get(workflow.id) : null) ||
      null;
    return {
      ...item,
      workflowFile: getWorkflowFileName(item.workflowPath),
      workflowUrl: workflow?.html_url || workflowActionsUrl(repoSlug, item.workflowPath),
      lastRun: rawRun ? normalizeGithubRun(rawRun) : null,
      github: {
        id: workflow?.id ?? null,
        name: workflow?.name ?? item.workflowName,
        state,
        stateLabelZh: workflowStateLabelZh(state),
        enabled,
        matched: !!workflow,
        canToggle: hasGithubToken && !!workflow,
      },
    };
  });
}

async function githubApi(pathname, { method = 'GET', body } = {}) {
  const token = getGithubActionsToken();
  if (!token) throw new Error('GitHub Actions admin token is not configured');
  const response = await fetch(`https://api.github.com${pathname}`, {
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

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API ${method} ${pathname} failed: ${response.status} ${detail}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function fetchGithubWorkflows() {
  const repoSlug = getGithubRepoSlug();
  const data = await githubApi(`/repos/${repoSlug}/actions/workflows?per_page=100`);
  return {
    repoSlug,
    workflows: (data?.workflows || []).map(normalizeGithubWorkflow),
  };
}

/**
 * 近期 workflow runs（跨全部 workflow，依建立時間新到舊）。
 * 供後台顯示各排程「最後執行時間」；抓取失敗僅 warn，回空陣列（不阻塞列表）。
 */
export async function fetchGithubWorkflowRuns() {
  const repoSlug = getGithubRepoSlug();
  try {
    const data = await githubApi(`/repos/${repoSlug}/actions/runs?per_page=100`);
    return (data?.workflow_runs || []).map((run) => ({
      workflow_id: run.workflow_id,
      path: run.path ?? null,
      status: run.status ?? null,
      conclusion: run.conclusion ?? null,
      run_started_at: run.run_started_at ?? null,
      created_at: run.created_at ?? null,
      html_url: run.html_url ?? null,
    }));
  } catch (err) {
    console.warn('[go-no-go-schedules] fetchGithubWorkflowRuns failed:', err?.message ?? err);
    return [];
  }
}

export async function listCronJobsForAdmin() {
  const token = getGithubActionsToken();
  const repoSlug = getGithubRepoSlug();
  if (!token) {
    return {
      repoSlug,
      hasGithubToken: false,
      jobs: buildScheduleViewModels({ hasGithubToken: false, repoSlug }),
    };
  }

  const [{ workflows }, runs] = await Promise.all([fetchGithubWorkflows(), fetchGithubWorkflowRuns()]);
  return {
    repoSlug,
    hasGithubToken: true,
    jobs: buildScheduleViewModels({ githubWorkflows: workflows, githubRuns: runs, hasGithubToken: true, repoSlug }),
  };
}

export async function setGithubWorkflowEnabled({ jobKey, enabled }) {
  const item = REGISTRY_BY_KEY.get(jobKey);
  if (!item) throw new Error(`Unknown jobKey: ${jobKey}`);

  const repoSlug = getGithubRepoSlug();
  const workflowId = getWorkflowFileName(item.workflowPath);
  const action = enabled ? 'enable' : 'disable';
  await githubApi(`/repos/${repoSlug}/actions/workflows/${workflowId}/${action}`, { method: 'PUT' });

  return {
    jobKey,
    enabled: !!enabled,
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

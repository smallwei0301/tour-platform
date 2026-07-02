// 排程工作流（internal cron sweeps）的後台控制與執行紀錄。
//
// 三件事，單一來源：
//   1. CRON_JOBS registry — 7 支 internal endpoints 的排程資訊（顯示用，
//      cron 時間鏡射 .github/workflows/*.yml；改時間仍需改 YAML，後台唯讀）。
//   2. 開關（cron_job_controls）— admin 可停用單一 job；endpoint 於 auth
//      通過後檢查，停用時 no-op 回 skipped_by_admin。fail-open：讀取失敗
//      （例如 production 尚未套 migration）一律視為 enabled，排程不因後台
//      故障而中斷。
//   3. 執行紀錄（cron_run_log）— endpoint 每次執行寫一筆 outcome＋彙總
//      （只存計數/旗標，不存訂單明細或 PII）。寫入失敗僅 warn，不影響主流程。
//
// Supabase 缺席時（local dev / tests）退回 in-memory store，
// 同 notification-settings.mjs 模式。

import { createClient } from '@supabase/supabase-js';

function hasSupabaseEnv() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ---------------------------------------------------------------------------
// Registry（顯示用單一來源；cron 欄位鏡射 workflow YAML）
// ---------------------------------------------------------------------------

export const CRON_JOBS = [
  {
    jobKey: 'settlement_sweep',
    nameZh: '出款結算 sweep',
    descriptionZh: 'completed 訂單結算進 payout_items、累積 guide_balances',
    endpoint: '/api/internal/settlement/sweep',
    workflowFile: 'settlement-sweep.yml',
    schedule: '每日 02:00 UTC（10:00 台北）',
  },
  {
    jobKey: 'settlement_generate_payouts',
    nameZh: '出款單產生',
    descriptionZh: '餘額達門檻的導遊產生 pending 出款單（接在 sweep 之後串行）',
    endpoint: '/api/internal/settlement/generate-payouts',
    workflowFile: 'settlement-sweep.yml',
    schedule: '每日 02:00 UTC（10:00 台北，Step 2）',
  },
  {
    jobKey: 'pre_tour_reminder_sweep',
    nameZh: '行前提醒 sweep',
    descriptionZh: '掃描近期出團訂單發送行前提醒（Email/Telegram）',
    endpoint: '/api/internal/reminders/pre-tour-sweep',
    workflowFile: 'pre-tour-reminder-sweep.yml',
    schedule: '每小時',
  },
  {
    jobKey: 'review_invitation_sweep',
    nameZh: '評價邀請 sweep',
    descriptionZh: '出團後邀請旅客留評價',
    endpoint: '/api/internal/reviews/review-invitation-sweep',
    workflowFile: 'review-invitation-sweep.yml',
    schedule: '每日 10:00 UTC（18:00 台北）',
  },
  {
    jobKey: 'unpaid_expiry_sweep',
    nameZh: '逾期未付款清理',
    descriptionZh: '過期未付款訂單自動取消釋放名額',
    endpoint: '/api/internal/bookings/unpaid-expiry-sweep',
    workflowFile: 'unpaid-expiry-sweep.yml',
    schedule: '每日 18:00 UTC（02:00 台北）',
  },
  {
    jobKey: 'ecpay_failure_sweep',
    nameZh: 'ECPay 失敗告警 sweep',
    descriptionZh: '掃近 60 分鐘 callback 失敗，超過門檻觸發 incident 告警',
    endpoint: '/api/internal/alerts/ecpay-failure-sweep',
    workflowFile: 'ecpay-failure-sweep.yml',
    schedule: '每小時（:15）',
  },
  {
    jobKey: 'ecpay_reconcile',
    nameZh: 'ECPay 付款對帳',
    descriptionZh: '對帳 pending ECPay 付款，補正 callback 漏接的訂單狀態',
    endpoint: '/api/internal/payments/ecpay-reconcile',
    workflowFile: 'ecpay-reconcile.yml',
    schedule: '每日 03:30 UTC（11:30 台北）',
  },
];

export const CRON_JOB_KEYS = CRON_JOBS.map((j) => j.jobKey);

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

const memoryControls = new Map(); // jobKey -> { enabled, updatedAt, updatedBy, reason }
const memoryRuns = []; // { jobKey, outcome, summary, source, startedAt, finishedAt }

/** Test-only: reset in-memory state. */
export function __resetCronControlsForTest() {
  memoryControls.clear();
  memoryRuns.length = 0;
}

// ---------------------------------------------------------------------------
// 開關
// ---------------------------------------------------------------------------

/**
 * 單一 job 是否啟用。預設 enabled；任何讀取錯誤 fail-open 回 enabled
 * （排程連續性優先於後台可用性）。
 * @returns {Promise<{ enabled: boolean }>}
 */
export async function isCronJobEnabled(jobKey) {
  try {
    if (!hasSupabaseEnv()) {
      const row = memoryControls.get(jobKey);
      return { enabled: row ? !!row.enabled : true };
    }
    const { data, error } = await getSupabase()
      .from('cron_job_controls')
      .select('enabled')
      .eq('job_key', jobKey)
      .maybeSingle();
    if (error) throw error;
    return { enabled: data ? !!data.enabled : true };
  } catch (err) {
    console.warn(`[cron-job-controls] isCronJobEnabled(${jobKey}) failed, fail-open:`, err?.message ?? err);
    return { enabled: true };
  }
}

/**
 * 全部 job 的開關狀態 map（後台列表用）。讀取失敗回全 enabled。
 * @returns {Promise<Record<string, { enabled: boolean, updatedAt: string|null, updatedBy: string|null, reason: string|null }>>}
 */
export async function getCronJobControls() {
  const result = {};
  for (const key of CRON_JOB_KEYS) result[key] = { enabled: true, updatedAt: null, updatedBy: null, reason: null };
  try {
    if (!hasSupabaseEnv()) {
      for (const [key, row] of memoryControls) {
        if (result[key]) result[key] = { ...result[key], ...row };
      }
      return result;
    }
    const { data, error } = await getSupabase()
      .from('cron_job_controls')
      .select('job_key, enabled, updated_at, updated_by, reason');
    if (error) throw error;
    for (const row of data ?? []) {
      if (result[row.job_key]) {
        result[row.job_key] = {
          enabled: !!row.enabled,
          updatedAt: row.updated_at ?? null,
          updatedBy: row.updated_by ?? null,
          reason: row.reason ?? null,
        };
      }
    }
    return result;
  } catch (err) {
    console.warn('[cron-job-controls] getCronJobControls failed, fail-open all:', err?.message ?? err);
    return result;
  }
}

/**
 * 設定開關（admin）。
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function setCronJobControl({ jobKey, enabled, actor, reason }) {
  if (!CRON_JOB_KEYS.includes(jobKey)) return { ok: false, error: `unknown job_key: ${jobKey}` };
  const record = {
    enabled: !!enabled,
    updatedAt: new Date().toISOString(),
    updatedBy: actor ?? null,
    reason: reason ?? null,
  };
  if (!hasSupabaseEnv()) {
    memoryControls.set(jobKey, record);
    return { ok: true };
  }
  const { error } = await getSupabase()
    .from('cron_job_controls')
    .upsert(
      {
        job_key: jobKey,
        enabled: record.enabled,
        updated_at: record.updatedAt,
        updated_by: record.updatedBy,
        reason: record.reason,
      },
      { onConflict: 'job_key' },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 執行紀錄
// ---------------------------------------------------------------------------

/**
 * 寫一筆執行紀錄。summary 僅允許計數/旗標層級資料（呼叫端負責不傳
 * 訂單明細/PII）。寫入失敗僅 warn — 絕不影響 sweep 主流程。
 * @param {{ jobKey: string, outcome: 'success'|'error'|'skipped_by_admin',
 *          summary?: object|null, source?: string, startedAt?: string }} params
 */
export async function recordCronRun({ jobKey, outcome, summary = null, source = 'schedule', startedAt = null }) {
  const row = {
    job_key: jobKey,
    outcome,
    summary,
    source,
    started_at: startedAt ?? new Date().toISOString(),
    finished_at: new Date().toISOString(),
  };
  try {
    if (!hasSupabaseEnv()) {
      memoryRuns.unshift(row);
      if (memoryRuns.length > 200) memoryRuns.length = 200;
      return { ok: true };
    }
    const { error } = await getSupabase().from('cron_run_log').insert(row);
    if (error) throw error;
    // 保留期清理（fire-and-forget，不阻塞 sweep 主流程）：每小時多支寫入 →
    // 一年約 1.8 萬列，無清理會無限成長。刪超過保留期的舊列（indexed range）。
    void pruneOldCronRuns().catch(() => {});
    return { ok: true };
  } catch (err) {
    console.warn(`[cron-job-controls] recordCronRun(${jobKey}) failed:`, err?.message ?? err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/** cron_run_log 保留天數；超過即由 recordCronRun 順手清理。 */
export const CRON_RUN_LOG_RETENTION_DAYS = 90;

/**
 * 刪除超過保留期的 cron_run_log 列。best-effort，失敗僅 warn。
 * @param {{ retentionDays?: number, nowMs?: number }} [opts] nowMs 供測試注入
 * @returns {Promise<{ ok: boolean, pruned?: number, error?: string }>}
 */
export async function pruneOldCronRuns({ retentionDays = CRON_RUN_LOG_RETENTION_DAYS, nowMs } = {}) {
  const cutoffIso = new Date((nowMs ?? Date.now()) - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    if (!hasSupabaseEnv()) {
      const before = memoryRuns.length;
      const kept = memoryRuns.filter((r) => (r.finished_at ?? '') >= cutoffIso);
      memoryRuns.length = 0;
      memoryRuns.push(...kept);
      return { ok: true, pruned: before - memoryRuns.length };
    }
    const { error } = await getSupabase().from('cron_run_log').delete().lt('finished_at', cutoffIso);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.warn('[cron-job-controls] pruneOldCronRuns failed:', err?.message ?? err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * 每個 job 最近 N 筆執行紀錄（後台列表用）。讀取失敗回空。
 * @returns {Promise<Record<string, Array<{ job_key: string, outcome: string, summary: object|null, source: string, started_at: string, finished_at: string }>>>}
 */
export async function listRecentCronRuns({ perJob = 5 } = {}) {
  const grouped = {};
  for (const key of CRON_JOB_KEYS) grouped[key] = [];
  try {
    if (!hasSupabaseEnv()) {
      for (const row of memoryRuns) {
        if (grouped[row.job_key] && grouped[row.job_key].length < perJob) grouped[row.job_key].push(row);
      }
      return grouped;
    }
    // 一次撈近期紀錄再在應用層分組（單表小量，避免 N 次查詢）
    const { data, error } = await getSupabase()
      .from('cron_run_log')
      .select('job_key, outcome, summary, source, started_at, finished_at')
      .order('finished_at', { ascending: false })
      .limit(perJob * CRON_JOB_KEYS.length * 3);
    if (error) throw error;
    for (const row of data ?? []) {
      if (grouped[row.job_key] && grouped[row.job_key].length < perJob) grouped[row.job_key].push(row);
    }
    return grouped;
  } catch (err) {
    console.warn('[cron-job-controls] listRecentCronRuns failed:', err?.message ?? err);
    return grouped;
  }
}

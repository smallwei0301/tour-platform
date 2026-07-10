'use client';

import { useEffect, useState } from 'react';
import { Card } from '../../../src/components/admin/ui';
import { csrfHeaders } from '../../../src/lib/csrf-client';

interface CronJob {
  jobKey: string;
  labelZh: string;
  summaryZh: string;
  riskLevelZh: string;
  riskReasonZh: string;
  disableEffectZh: string;
  workflowName: string;
  workflowFile: string;
  workflowUrl: string;
  scheduleZh: string;
  cron: string;
  lastRun: {
    startedAt: string | null;
    status: string | null;
    conclusion: string | null;
    conclusionLabelZh: string;
    url: string | null;
  } | null;
  github: {
    id: number | null;
    name: string;
    state: string;
    stateLabelZh: string;
    enabled: boolean;
    matched: boolean;
    canToggle: boolean;
  };
}

function statePillStyle(enabled: boolean) {
  return enabled
    ? { color: '#166534', background: '#dcfce7', borderColor: '#86efac' }
    : { color: '#991b1b', background: '#fee2e2', borderColor: '#fca5a5' };
}

function formatTaipei(iso: string | null): string {
  if (!iso) return '尚無紀錄';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '尚無紀錄';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function runConclusionColor(conclusion: string | null, status: string | null): string {
  if (status && status !== 'completed') return '#92400e';
  if (conclusion === 'success') return '#166534';
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') return '#991b1b';
  return '#64748b';
}

export default function CronJobsPanel() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [hasGithubToken, setHasGithubToken] = useState(true);

  async function load() {
    setError(null);
    const response = await fetch('/api/admin/cron-jobs', { cache: 'no-store' });
    const payload = await response.json();
    if (payload?.ok && payload?.data?.jobs) {
      setJobs(payload.data.jobs);
      setHasGithubToken(Boolean(payload.data.hasGithubToken));
      return;
    }
    throw new Error(payload?.error?.message || '載入排程管理失敗');
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : '載入排程管理失敗'))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(job: CronJob) {
    const next = !job.github.enabled;
    const actionLabel = next ? '開啟' : '停用';
    const warning = `${actionLabel}「${job.labelZh}」？${job.disableEffectZh}`;
    if (!next && !window.confirm(warning)) return;

    setPending(job.jobKey);
    setError(null);
    try {
      const res = await fetch('/api/admin/cron-jobs', {
        method: 'PATCH',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ jobKey: job.jobKey, enabled: next }),
      });
      const payload = await res.json();
      if (!payload?.ok) throw new Error(payload?.error?.message || '切換排程失敗');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '切換排程失敗');
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>排程管理</h2>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            真實 GitHub Actions 排程與開關狀態。停用後不會再發 Telegram / Email 通知。
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          排程時間以 workflow YAML 為準；此面板只管理 enable / disable。
        </div>
      </div>

      {!hasGithubToken && !loading && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: '#fff7ed', color: '#9a3412', fontSize: 12 }}>
          目前缺少 GitHub Actions admin token，僅能顯示 registry，無法切換開關。
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: '#64748b' }}>載入中⋯</p>
      ) : error ? (
        <p style={{ fontSize: 13, color: '#991b1b' }}>{error}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} data-testid="cron-jobs-table">
            <thead>
              <tr style={{ textAlign: 'left', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                <th scope="col" style={{ padding: '8px' }}>工作流</th>
                <th scope="col" style={{ padding: '8px' }}>功能說明</th>
                <th scope="col" style={{ padding: '8px' }}>真實 GitHub Actions 排程</th>
                <th scope="col" style={{ padding: '8px' }}>最後執行</th>
                <th scope="col" style={{ padding: '8px' }}>風險分級</th>
                <th scope="col" style={{ padding: '8px' }}>目前狀態</th>
                <th scope="col" style={{ padding: '8px' }}>開關</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const pill = statePillStyle(job.github.enabled);
                return (
                  <tr key={job.jobKey} data-testid={`cron-job-row-${job.jobKey}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700 }}>{job.labelZh}</div>
                      <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{job.workflowName}</div>
                      <a href={job.workflowUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#1d4ed8' }}>
                        GitHub Actions ↗
                      </a>
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <div style={{ color: '#0f172a' }}>{job.summaryZh}</div>
                      <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{job.disableEffectZh}</div>
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <div>{job.scheduleZh}</div>
                      <code style={{ display: 'inline-block', marginTop: 4, background: '#f8fafc', padding: '2px 6px', borderRadius: 6, color: '#334155' }}>{job.cron}</code>
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }} data-testid={`cron-last-run-${job.jobKey}`}>
                      {job.lastRun && job.lastRun.startedAt ? (
                        <>
                          <div style={{ color: '#0f172a' }}>{formatTaipei(job.lastRun.startedAt)}</div>
                          <div style={{ fontSize: 12, marginTop: 2, color: runConclusionColor(job.lastRun.conclusion, job.lastRun.status), fontWeight: 700 }}>
                            {job.lastRun.url ? (
                              <a href={job.lastRun.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                                {job.lastRun.conclusionLabelZh} ↗
                              </a>
                            ) : (
                              job.lastRun.conclusionLabelZh
                            )}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>尚無紀錄</span>
                      )}
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700 }}>{job.riskLevelZh}</div>
                      <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{job.riskReasonZh}</div>
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          border: '1px solid',
                          ...pill,
                        }}
                      >
                        {job.github.stateLabelZh}
                      </span>
                      {!job.github.matched && (
                        <div style={{ color: '#9a3412', fontSize: 12, marginTop: 4 }}>GitHub workflow 未對上，請檢查 registry。</div>
                      )}
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <button
                        onClick={() => toggle(job)}
                        disabled={!job.github.canToggle || pending === job.jobKey}
                        data-testid={`cron-toggle-${job.jobKey}`}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: !job.github.canToggle || pending === job.jobKey ? 'not-allowed' : 'pointer',
                          border: '1px solid',
                          borderColor: job.github.enabled ? '#fca5a5' : '#86efac',
                          color: job.github.enabled ? '#991b1b' : '#166534',
                          background: job.github.enabled ? '#fee2e2' : '#dcfce7',
                          opacity: !job.github.canToggle || pending === job.jobKey ? 0.6 : 1,
                        }}
                      >
                        {job.github.enabled ? '停用' : '開啟'}
                      </button>
                      {!job.github.canToggle && (
                        <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>缺 token 或 GitHub 尚未對上</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

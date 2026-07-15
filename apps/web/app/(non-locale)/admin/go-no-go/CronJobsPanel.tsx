'use client';

/**
 * 排程工作流控制台（owner 2026-07-02 決策：選項 A — App 內建開關）。
 *
 * - 結果：cron_run_log 最近執行（endpoint 每次執行自行記錄，涵蓋排程與手動觸發）
 * - 開關：DB-backed kill switch，停用後 endpoint 於下一次觸發 no-op（workflow
 *   仍會發請求並成功結束，回 skipped_by_admin）
 * - 時間：唯讀顯示（鏡射 .github/workflows/*.yml 的 cron；改時間需改 YAML，
 *   附 GitHub Actions 深連結）
 */
import { useEffect, useState } from 'react';
import { Card } from '../../../../src/components/admin/ui';
import { csrfHeaders } from '../../../../src/lib/csrf-client';

interface CronRun {
  outcome: 'success' | 'error' | 'skipped_by_admin' | (string & {});
  summary?: Record<string, unknown> | null;
  source?: string;
  started_at?: string;
  finished_at?: string;
}

interface CronJob {
  jobKey: string;
  nameZh: string;
  descriptionZh: string;
  endpoint: string;
  workflowFile: string;
  workflowUrl: string;
  schedule: string;
  control: { enabled: boolean; updatedAt: string | null; updatedBy: string | null; reason: string | null };
  recentRuns: CronRun[];
}

const OUTCOME_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  success: { label: '成功', color: '#166534', bg: '#dcfce7' },
  error: { label: '失敗', color: '#991b1b', bg: '#fee2e2' },
  skipped_by_admin: { label: '已停用略過', color: '#475569', bg: '#f1f5f9' },
};

function formatTime(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  } catch {
    return iso;
  }
}

export default function CronJobsPanel() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  function load() {
    fetch('/api/admin/cron-jobs', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j?.data?.jobs) setJobs(j.data.jobs);
        else setError(j?.error?.message || '載入排程工作流失敗');
      })
      .catch((e) => setError(e?.message || '網路連線錯誤'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(job: CronJob) {
    const next = !job.control.enabled;
    if (!next && !window.confirm(`確定要停用「${job.nameZh}」？停用後排程觸發時將直接略過，直到重新開啟。`)) {
      return;
    }
    setPending(job.jobKey);
    try {
      const res = await fetch('/api/admin/cron-jobs', {
        method: 'PATCH',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ jobKey: job.jobKey, enabled: next }),
      });
      const j = await res.json();
      if (j?.ok) load();
      else setError(j?.error?.message || '切換失敗');
    } catch (e) {
      setError(e instanceof Error ? e.message : '切換失敗');
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>排程工作流</h2>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          開關即時生效（停用後排程觸發即略過）；排程時間唯讀，調整需修改 workflow YAML
        </span>
      </div>
      {loading ? (
        <p style={{ fontSize: 13, color: '#64748b' }}>載入中⋯</p>
      ) : error ? (
        <p style={{ fontSize: 13, color: '#991b1b' }}>{error}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} data-testid="cron-jobs-table">
            <thead>
              <tr style={{ textAlign: 'left', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                <th scope="col" style={{ padding: '6px 8px' }}>工作流</th>
                <th scope="col" style={{ padding: '6px 8px' }}>排程時間</th>
                <th scope="col" style={{ padding: '6px 8px' }}>最近執行</th>
                <th scope="col" style={{ padding: '6px 8px' }}>開關</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const lastRun = job.recentRuns[0];
                const outcomeCfg = lastRun ? OUTCOME_CONFIG[lastRun.outcome] ?? OUTCOME_CONFIG.error : null;
                return (
                  <tr key={job.jobKey} data-testid={`cron-job-row-${job.jobKey}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600 }}>{job.nameZh}</div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>{job.descriptionZh}</div>
                      <a href={job.workflowUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#1d4ed8' }}>
                        GitHub Actions 歷史 ↗
                      </a>
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{job.schedule}</td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      {lastRun && outcomeCfg ? (
                        <div>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 600,
                              color: outcomeCfg.color,
                              background: outcomeCfg.bg,
                            }}
                          >
                            {outcomeCfg.label}
                          </span>
                          <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{formatTime(lastRun.finished_at)}</div>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>
                          尚無紀錄
                          <br />
                          （production 需先套用 20260702_cron_job_controls migration）
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <button
                        onClick={() => toggle(job)}
                        disabled={pending === job.jobKey}
                        data-testid={`cron-toggle-${job.jobKey}`}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: job.control.enabled ? '#86efac' : '#fca5a5',
                          color: job.control.enabled ? '#166534' : '#991b1b',
                          background: job.control.enabled ? '#dcfce7' : '#fee2e2',
                          opacity: pending === job.jobKey ? 0.5 : 1,
                        }}
                      >
                        {job.control.enabled ? '啟用中' : '已停用'}
                      </button>
                      {!job.control.enabled && job.control.updatedAt && (
                        <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                          {formatTime(job.control.updatedAt)} 停用
                        </div>
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

'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader } from '../../../src/components/admin/ui';

type ReadinessStatus = 'pass' | 'warning' | 'fail' | 'manual' | 'evidence_required' | (string & {});

interface ReadinessItem {
  id: string;
  label: string;
  status: ReadinessStatus;
  owner: string;
  note: string;
}

interface Metrics {
  healthyOrderRate: number;
  exceptionRate: number;
  pendingRefunds: number;
  paidConfirmedRatio: number;
  incidents24h: number;
}

type VerdictState = 'GO' | 'HOLD' | 'NO_GO';

interface Verdict {
  state: VerdictState;
  reason: string;
  computedAt: string;
  deploySha: string;
}

interface RecommendedAction {
  label: string;
  href: string;
}

interface GoNoGoData {
  readiness: ReadinessItem[];
  metrics: Metrics;
  verdict: Verdict;
  recommendedActions: RecommendedAction[];
}

const READINESS_STATUS_CONFIG: Record<ReadinessStatus, { label: string; color: string; bg: string }> = {
  pass: { label: 'PASS', color: '#166534', bg: '#dcfce7' },
  warning: { label: 'WARNING', color: '#854d0e', bg: '#fef9c3' },
  fail: { label: 'FAIL', color: '#991b1b', bg: '#fee2e2' },
  manual: { label: 'MANUAL', color: '#1e40af', bg: '#dbeafe' },
  evidence_required: { label: 'EVIDENCE REQUIRED', color: '#7c2d12', bg: '#ffedd5' },
};

const VERDICT_CONFIG: Record<VerdictState, { label: string; color: string; bg: string; border: string }> = {
  GO: { label: 'GO', color: '#166534', bg: '#dcfce7', border: '#86efac' },
  HOLD: { label: 'HOLD', color: '#854d0e', bg: '#fef9c3', border: '#fde047' },
  NO_GO: { label: 'NO_GO', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
};

const READINESS_STATUS_FALLBACK_CONFIG = {
  color: '#475569',
  bg: '#f1f5f9',
};

function ReadinessStatusPill({ status }: { status: ReadinessStatus }) {
  const cfg = READINESS_STATUS_CONFIG[status as keyof typeof READINESS_STATUS_CONFIG] ?? {
    ...READINESS_STATUS_FALLBACK_CONFIG,
    label: `UNKNOWN: ${status}`,
  };
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700,
      display: 'inline-block', letterSpacing: '0.04em',
    }}>
      {cfg.label}
    </span>
  );
}

export default function GoNoGoPage() {
  const [data, setData] = useState<GoNoGoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/admin/go-no-go', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j?.data) {
          setData(j.data);
        } else {
          setError(j?.error?.message || 'Unknown error loading dashboard');
        }
      })
      .catch((e) => setError(e?.message || 'Network error'))
      .finally(() => setLoading(false));
  }, []);

  const verdict = data?.verdict;
  const verdictCfg = verdict ? VERDICT_CONFIG[verdict.state] : null;

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader
        title="Go/No-Go Dashboard"
        subtitle="Release readiness checklist and system verdict"
        actions={
          verdict && verdictCfg ? (
            <span style={{
              background: verdictCfg.bg,
              color: verdictCfg.color,
              border: `1.5px solid ${verdictCfg.border}`,
              borderRadius: 999, padding: '6px 20px',
              fontSize: 16, fontWeight: 800, letterSpacing: '0.08em',
            }}>
              {verdictCfg.label}
            </span>
          ) : null
        }
      />

      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {loading && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            Loading...
          </div>
        )}

        {error && (
          <Card style={{ padding: '20px 24px', borderColor: '#fecaca', background: '#fff5f5' }}>
            <p style={{ margin: 0, color: '#991b1b', fontWeight: 600 }}>{error}</p>
          </Card>
        )}

        {/* ── Block 1: Readiness Checklist ── */}
        {data && (
          <Card>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>
                Readiness Checklist
              </h2>
            </div>
            <div style={{ padding: '12px 20px' }}>
              {data.readiness.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    padding: '12px 0', borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <ReadinessStatusPill status={item.status} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{item.note}</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                    owner: {item.owner}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Block 2: Core Metrics ── */}
        {data && (
          <Card>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>
                Core Metrics <span style={{ fontWeight: 400, fontSize: 12, color: '#9ca3af' }}>(last 7 days)</span>
              </h2>
            </div>
            <div style={{
              padding: '20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 16,
            }}>
              {[
                { label: 'Healthy Order Rate', value: `${data.metrics.healthyOrderRate}%`, alert: data.metrics.healthyOrderRate < 80 },
                { label: 'Exception Rate', value: `${data.metrics.exceptionRate}%`, alert: data.metrics.exceptionRate > 5 },
                { label: 'Pending Refunds', value: String(data.metrics.pendingRefunds), alert: data.metrics.pendingRefunds > 10 },
                { label: 'Paid/Confirmed Ratio', value: `${data.metrics.paidConfirmedRatio}%`, alert: false },
                { label: 'Incidents (24h)', value: String(data.metrics.incidents24h), alert: data.metrics.incidents24h > 0 },
              ].map((m) => (
                <div
                  key={m.label}
                  style={{
                    background: m.alert ? '#fff5f5' : '#f9fafb',
                    borderRadius: 10, padding: '14px 16px',
                    border: `1px solid ${m.alert ? '#fecaca' : '#e5e7eb'}`,
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 800, color: m.alert ? '#991b1b' : '#111' }}>
                    {m.value}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Block 3: Today's Verdict ── */}
        {data && verdict && verdictCfg && (
          <Card style={{ borderColor: verdictCfg.border }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>
                {"Today's Verdict"}
              </h2>
              <span style={{
                background: verdictCfg.bg,
                color: verdictCfg.color,
                border: `1.5px solid ${verdictCfg.border}`,
                borderRadius: 999, padding: '4px 18px',
                fontSize: 15, fontWeight: 800, letterSpacing: '0.06em',
              }}>
                {verdictCfg.label}
              </span>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151', fontWeight: 500 }}>
                {verdict.reason}
              </p>
              <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <span>Computed: {new Date(verdict.computedAt).toLocaleString()}</span>
                <span>Deploy SHA: <code style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{verdict.deploySha.slice(0, 8)}</code></span>
              </div>
            </div>
          </Card>
        )}

        {/* ── Block 4: Recommended Actions ── */}
        {data && (
          <Card>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>
                Recommended Actions
              </h2>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {data.recommendedActions.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>✅</span>
                  <span style={{ fontSize: 14, color: '#166534', fontWeight: 500 }}>
                    No actions required — system is healthy and ready to deploy.
                  </span>
                </div>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.recommendedActions.map((action, i) => (
                    <li key={i}>
                      <a
                        href={action.href}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          color: 'var(--tp-primary)', fontWeight: 600, fontSize: 14,
                          textDecoration: 'none',
                        }}
                      >
                        <span>→</span>
                        {action.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, PageHeader, LoadingSkeleton, EmptyState } from '../../../src/components/admin/ui';

type IncidentRow = {
  source: string;
  severity: string;
  message: string;
  created_at: string;
};

type HealthData = {
  counts: Record<string, Record<string, number>>;
  recent: IncidentRow[];
  deploySha: string;
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#dc2626',
  error: '#ea580c',
  warn: '#d97706',
  info: '#2563eb',
};

export default function AdminHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/admin/health', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) {
          setData(j.data);
        } else {
          setError(j?.error?.message || '載入失敗');
        }
      })
      .catch(() => setError('網路錯誤'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader
        title="系統健康"
        subtitle="Incidents 事件紀錄 · 過去 24 小時"
        actions={
          <Link href="/admin" style={{ fontSize: 13, color: 'var(--tp-primary)', fontWeight: 600 }}>
            ← 返回 Dashboard
          </Link>
        }
      />

      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Deploy SHA */}
        {data && (
          <Card style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Deploy SHA</span>
            <code style={{ fontSize: 12, color: '#374151', background: '#f3f4f6', padding: '2px 8px', borderRadius: 6 }}>
              {data.deploySha}
            </code>
          </Card>
        )}

        {/* Incident counts by source/severity */}
        {data && Object.keys(data.counts).length > 0 && (
          <Card>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111' }}>事件統計（過去 24 小時）</h3>
            </div>
            <div style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {Object.entries(data.counts).map(([source, bySeverity]) =>
                Object.entries(bySeverity).map(([severity, count]) => (
                  <div key={`${source}-${severity}`} style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: '#f9fafb', border: `1px solid ${SEVERITY_COLOR[severity] ?? '#e5e7eb'}`,
                    color: SEVERITY_COLOR[severity] ?? '#374151',
                  }}>
                    {source} / {severity}: {count}
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* Recent incidents table */}
        <Card>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111' }}>最近事件（最新 10 筆）</h3>
          </div>
          <div style={{ padding: '0 18px 12px' }}>
            {loading ? (
              <LoadingSkeleton rows={5} />
            ) : error ? (
              <p style={{ margin: '12px 0', fontSize: 13, color: '#ef4444' }}>{error}</p>
            ) : !data || data.recent.length === 0 ? (
              <EmptyState message="過去 24 小時無事件紀錄" />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {(['source', 'severity', 'message', 'created_at'] as const).map((col) => (
                      <th key={col} style={{
                        padding: '10px 12px', textAlign: 'left', fontWeight: 700,
                        color: '#374151', borderBottom: '1px solid #e5e7eb',
                        fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {col === 'created_at' ? '時間' : col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((row, i) => (
                    <tr key={i} style={{ borderBottom: i < data.recent.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                      <td style={{ padding: '10px 12px', color: '#374151' }}>{row.source}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                          background: `${SEVERITY_COLOR[row.severity] ?? '#9ca3af'}22`,
                          color: SEVERITY_COLOR[row.severity] ?? '#6b7280',
                        }}>
                          {row.severity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#374151', maxWidth: 360, wordBreak: 'break-word' }}>
                        {row.message}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        {new Date(row.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

      </div>
    </div>
  );
}

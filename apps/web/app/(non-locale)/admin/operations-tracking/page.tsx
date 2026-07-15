'use client';

/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { csrfHeaders } from '../../../../src/lib/csrf-client';

// 前端即時試算（與後端公式一致）
function calcContribution(row: Row, kpiConfig?: { commissionRate?: number; paymentFeeRate?: number }) {
  const commissionRate = kpiConfig?.commissionRate ?? 0.15;
  const paymentFeeRate = kpiConfig?.paymentFeeRate ?? 0.035;
  const gmv = Number(row.gmv || 0);
  const refundAmountTwd = Number(row.refundAmountTwd || 0);
  const effectiveGmv = Math.max(0, gmv - refundAmountTwd);
  const commissionTwd = Math.round(effectiveGmv * commissionRate);
  const paymentFeeTwd = Math.round(gmv * paymentFeeRate);
  const manualCostTwd = Number(row.manualCostTwd || 0);
  const subsidyTwd = Number(row.subsidyTwd || 0);
  return {
    effectiveGmv,
    commissionTwd,
    paymentFeeTwd,
    finalContributionTwd: commissionTwd - paymentFeeTwd - manualCostTwd - subsidyTwd,
  };
}
import { Card, PageHeader } from '../../../../src/components/admin/ui';
import { ResponsiveTable, type ResponsiveColumn } from '../../../../src/components/admin/responsive';

type Row = {
  orderId: string; orderDate: string; guideName: string; activityName: string;
  scheduleDate: string; travelers: number; status: string; gmv: number;
  effectiveGmv?: number;
  commissionTwd: number; paymentFeeTwd: number; manualMinutes: number;
  manualCostTwd: number; refundAmountTwd: number; subsidyTwd: number;
  hasException: boolean; finalContributionTwd: number; isHealthyOrder: boolean;
  isRescheduled?: boolean; hasComplaint?: boolean; hasGuideAdjustment?: boolean;
  hasOversellIssue?: boolean; isDisputed?: boolean; isSafetyCase?: boolean; note?: string | null;
};

export default function OperationsTrackingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [listRes, sumRes] = await Promise.all([
        fetch('/api/admin/operations-tracking', { cache: 'no-store' }),
        fetch('/api/admin/operations-tracking/summary', { cache: 'no-store' }),
      ]);
      const data = (await listRes.json())?.data || [];
      setRows(data);
      setSummary((await sumRes.json())?.data || null);
      if (selected) {
        const fresh = data.find((r: Row) => r.orderId === selected.orderId);
        if (fresh) setSelected(fresh);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { load().catch(() => { setRows([]); setSummary(null); }); }, []);

  const totals = useMemo(() => summary || { totalGmv: 0, totalCommissionTwd: 0, avgFinalContributionTwd: 0, healthyOrderRate: 0 }, [summary]);

  // 即時試算（使用 summary 中的 kpiConfig）
  const preview = useMemo(() => selected ? calcContribution(selected, summary?.kpiConfig) : null, [selected, summary]);

  async function saveSelected() {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch('/api/admin/operations-tracking', { method: 'PATCH', headers: csrfHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(selected) });
      await load();
    } finally { setSaving(false); }
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px', fontSize: 13, marginTop: 3, boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginTop: 12 };

  const opsColumns: ResponsiveColumn<Row>[] = [
    {
      key: 'orderId', header: 'Order', mobilePriority: 'hidden',
      cell: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' }}>{r.orderId.slice(0, 10)}…</span>,
    },
    {
      key: 'activity', header: '行程', mobilePriority: 'title',
      cell: (r) => <span style={{ fontSize: 13 }}>{r.activityName || '-'}</span>,
    },
    {
      key: 'healthy', header: '健康', mobilePriority: 'subtitle',
      cell: (r) => <span style={{ fontSize: 16 }}>{r.isHealthyOrder ? '✅' : '⚠️'}</span>,
    },
    {
      key: 'gmv', header: 'GMV', align: 'right', mobileLabel: 'GMV',
      cell: (r) => <strong>NT${Number(r.gmv || 0).toLocaleString()}</strong>,
    },
    {
      key: 'commission', header: '抽成', align: 'right', mobileLabel: '抽成',
      cell: (r) => `NT$${Number(r.commissionTwd || 0).toLocaleString()}`,
    },
    {
      key: 'final', header: '最終貢獻', align: 'right', mobileLabel: '最終貢獻',
      cell: (r) => (
        <span style={{ color: r.finalContributionTwd >= 0 ? '#15803d' : '#dc2626', fontWeight: 700 }}>
          NT${Number(r.finalContributionTwd || 0).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader
        title="操作追蹤"
        subtitle="每單貢獻、人工成本、健康訂單標記"
        actions={
          <a data-guide="ops-csv" href="/api/admin/operations-tracking/csv"
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--tp-primary)', color: 'var(--tp-primary)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            ↓ 匯出 CSV
          </a>
        }
      />

      <div className="admin-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Summary KPI */}
        <div data-guide="ops-kpi" className="admin-stat-grid">
          {[
            { label: '總 GMV', value: `NT$${Number(totals.totalGmv||0).toLocaleString()}`, icon: '💰' },
            { label: '平台總收入', value: `NT$${Number(totals.totalCommissionTwd||0).toLocaleString()}`, icon: '📊' },
            { label: '平均單筆貢獻', value: `NT$${Number(totals.avgFinalContributionTwd||0).toLocaleString()}`, icon: '📈' },
            { label: '健康訂單率', value: `${totals.healthyOrderRate||0}%`, icon: '✅' },
          ].map(c => (
            <Card key={c.label} style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#111', letterSpacing: '-0.5px' }}>{c.value}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{c.label}</div>
            </Card>
          ))}
        </div>

        <div className="admin-split-grid">
          {/* Table */}
          <Card data-guide="ops-table">
            <ResponsiveTable
              columns={opsColumns}
              rows={rows}
              getRowKey={(r) => r.orderId}
              onRowClick={(r) => setSelected(r)}
              selectedKey={selected?.orderId}
              loading={loading}
              loadingRows={8}
              emptyMessage="無操作追蹤資料"
            />
          </Card>

          {/* Edit Panel */}
          <Card data-guide="ops-edit" style={{ padding: 20 }}>
            {!selected ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
                <p style={{ margin: 0, fontSize: 14 }}>點選左側訂單編輯</p>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#111' }}>編輯營運欄位</div>
                <div style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 14, background: '#f9fafb', padding: '6px 10px', borderRadius: 6 }}>{selected.orderId}</div>

                <label htmlFor="ops-manual-minutes" style={labelStyle}>人工時間（分鐘）</label>
                <input id="ops-manual-minutes" type="number" value={selected.manualMinutes||0} onChange={e => setSelected({...selected, manualMinutes: Number(e.target.value||0)})} style={inputStyle} />

                <label htmlFor="ops-manual-cost" style={labelStyle}>人工成本（TWD）</label>
                <input id="ops-manual-cost" type="number" value={selected.manualCostTwd||0} onChange={e => setSelected({...selected, manualCostTwd: Number(e.target.value||0)})} style={inputStyle} />

                <label htmlFor="ops-refund-amount" style={labelStyle}>退款金額（TWD）</label>
                <input id="ops-refund-amount" type="number" value={selected.refundAmountTwd||0} onChange={e => setSelected({...selected, refundAmountTwd: Number(e.target.value||0)})} style={inputStyle} />

                <label htmlFor="ops-subsidy-amount" style={labelStyle}>補貼金額（TWD）</label>
                <input id="ops-subsidy-amount" type="number" value={selected.subsidyTwd||0} onChange={e => setSelected({...selected, subsidyTwd: Number(e.target.value||0)})} style={inputStyle} />

                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { key: 'isRescheduled', label: '🔄 已改期' },
                    { key: 'hasComplaint', label: '⚠️ 客訴' },
                    { key: 'hasGuideAdjustment', label: '🧭 導遊臨時調整' },
                    { key: 'hasOversellIssue', label: '❌ 超賣/場次異常' },
                    { key: 'isDisputed', label: '⚖️ 付款爭議（暫停撥款）' },
                    { key: 'isSafetyCase', label: '🛡️ 安全事件（暫停撥款）' },
                  ].map(item => (
                    <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!(selected as any)[item.key]}
                        onChange={e => setSelected({...selected, [item.key]: e.target.checked})}
                        style={{ width: 16, height: 16, accentColor: 'var(--tp-primary)' }} />
                      {item.label}
                    </label>
                  ))}
                </div>

                <label style={labelStyle}>備註</label>
                <textarea value={selected.note||''} onChange={e => setSelected({...selected, note: e.target.value})} rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }} />

                {/* 即時試算預覽 */}
                {preview && (
                  <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>📊 即時試算（未儲存）</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                      <span style={{ color: '#6b7280' }}>有效 GMV</span>
                      <span style={{ fontWeight: 600, textAlign: 'right' }}>NT${preview.effectiveGmv.toLocaleString()}</span>
                      <span style={{ color: '#6b7280' }}>平台抽成</span>
                      <span style={{ fontWeight: 600, textAlign: 'right' }}>NT${preview.commissionTwd.toLocaleString()}</span>
                      <span style={{ color: '#6b7280' }}>金流費（不退）</span>
                      <span style={{ fontWeight: 600, textAlign: 'right', color: '#dc2626' }}>-NT${preview.paymentFeeTwd.toLocaleString()}</span>
                      <span style={{ color: '#374151', fontWeight: 700, borderTop: '1px solid #bbf7d0', paddingTop: 6, marginTop: 2 }}>最終貢獻</span>
                      <span style={{ fontWeight: 800, textAlign: 'right', fontSize: 14, borderTop: '1px solid #bbf7d0', paddingTop: 6, marginTop: 2, color: preview.finalContributionTwd >= 0 ? '#15803d' : '#dc2626' }}>
                        NT${preview.finalContributionTwd.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                <button onClick={saveSelected} disabled={saving}
                  style={{ marginTop: 16, width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--tp-primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? '儲存中…' : '儲存變更'}
                </button>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

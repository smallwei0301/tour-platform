'use client';

import { useEffect, useMemo, useState } from 'react';

type Row = {
  orderId: string;
  orderDate: string;
  guideName: string;
  activityName: string;
  scheduleDate: string;
  travelers: number;
  status: string;
  gmv: number;
  commissionTwd: number;
  paymentFeeTwd: number;
  manualMinutes: number;
  manualCostTwd: number;
  refundAmountTwd: number;
  subsidyTwd: number;
  hasException: boolean;
  finalContributionTwd: number;
  isHealthyOrder: boolean;
  isRescheduled?: boolean;
  hasComplaint?: boolean;
  hasGuideAdjustment?: boolean;
  hasOversellIssue?: boolean;
  note?: string | null;
};

export default function OperationsTrackingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [listRes, sumRes] = await Promise.all([
      fetch('/api/admin/operations-tracking', { cache: 'no-store' }),
      fetch('/api/admin/operations-tracking/summary', { cache: 'no-store' })
    ]);
    const listJson = await listRes.json();
    const sumJson = await sumRes.json();
    const data = listJson?.data || [];
    setRows(data);
    setSummary(sumJson?.data || null);
    if (selected) {
      const fresh = data.find((r: Row) => r.orderId === selected.orderId);
      if (fresh) setSelected(fresh);
    }
  }

  useEffect(() => {
    load().catch(() => {
      setRows([]);
      setSummary(null);
    });
  }, []);

  const totals = useMemo(() => summary || {
    totalOrders: 0,
    totalGmv: 0,
    totalCommissionTwd: 0,
    avgCommissionTwd: 0,
    avgManualMinutes: 0,
    avgManualCostTwd: 0,
    refundRate: 0,
    exceptionRate: 0,
    avgFinalContributionTwd: 0,
    healthyOrderRate: 0
  }, [summary]);

  async function saveSelected() {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch('/api/admin/operations-tracking', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(selected)
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin Operations Tracking</h1>
      <p style={{ color: '#666' }}>MVP：每單貢獻、人工時間/成本、健康訂單標記 + CSV 匯出</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, margin: '12px 0 16px' }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>總 GMV<br /><strong>NT${Number(totals.totalGmv || 0).toLocaleString()}</strong></div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>平台總收入<br /><strong>NT${Number(totals.totalCommissionTwd || 0).toLocaleString()}</strong></div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>平均單筆貢獻<br /><strong>NT${Number(totals.avgFinalContributionTwd || 0).toLocaleString()}</strong></div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>健康訂單率<br /><strong>{totals.healthyOrderRate || 0}%</strong></div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <a href="/api/admin/operations-tracking/csv" style={{ color: '#0b7', textDecoration: 'underline' }}>匯出 CSV</a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
        <div style={{ overflowX: 'auto' }}>
          <table cellPadding={8} style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th align="left">Order</th>
                <th align="left">Activity</th>
                <th align="left">GMV</th>
                <th align="left">抽成</th>
                <th align="left">人工成本</th>
                <th align="left">退款</th>
                <th align="left">最終貢獻</th>
                <th align="left">健康</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orderId} style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: selected?.orderId === r.orderId ? '#f5fbf7' : 'transparent' }} onClick={() => setSelected(r)}>
                  <td>{r.orderId}</td>
                  <td>{r.activityName || '-'}</td>
                  <td>NT${Number(r.gmv || 0).toLocaleString()}</td>
                  <td>NT${Number(r.commissionTwd || 0).toLocaleString()}</td>
                  <td>NT${Number(r.manualCostTwd || 0).toLocaleString()}</td>
                  <td>NT${Number(r.refundAmountTwd || 0).toLocaleString()}</td>
                  <td style={{ color: r.finalContributionTwd >= 0 ? '#15803d' : '#b91c1c' }}>NT${Number(r.finalContributionTwd || 0).toLocaleString()}</td>
                  <td>{r.isHealthyOrder ? '✅' : '⚠️'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
          {!selected ? (
            <p style={{ color: '#666' }}>請先選擇一筆訂單</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>編輯營運欄位</h3>
              <p><strong>{selected.orderId}</strong></p>

              <label>人工時間（分鐘）<input type="number" value={selected.manualMinutes || 0} onChange={(e) => setSelected({ ...selected, manualMinutes: Number(e.target.value || 0) })} style={{ width: '100%' }} /></label>
              <label>人工成本（TWD）<input type="number" value={selected.manualCostTwd || 0} onChange={(e) => setSelected({ ...selected, manualCostTwd: Number(e.target.value || 0) })} style={{ width: '100%' }} /></label>
              <label>退款金額（TWD）<input type="number" value={selected.refundAmountTwd || 0} onChange={(e) => setSelected({ ...selected, refundAmountTwd: Number(e.target.value || 0) })} style={{ width: '100%' }} /></label>
              <label>補貼金額（TWD）<input type="number" value={selected.subsidyTwd || 0} onChange={(e) => setSelected({ ...selected, subsidyTwd: Number(e.target.value || 0) })} style={{ width: '100%' }} /></label>

              <label><input type="checkbox" checked={!!selected.isRescheduled} onChange={(e) => setSelected({ ...selected, isRescheduled: e.target.checked })} /> 是否改期</label><br />
              <label><input type="checkbox" checked={!!selected.hasComplaint} onChange={(e) => setSelected({ ...selected, hasComplaint: e.target.checked })} /> 是否客訴</label><br />
              <label><input type="checkbox" checked={!!selected.hasGuideAdjustment} onChange={(e) => setSelected({ ...selected, hasGuideAdjustment: e.target.checked })} /> 是否導遊臨時調整</label><br />
              <label><input type="checkbox" checked={!!selected.hasOversellIssue} onChange={(e) => setSelected({ ...selected, hasOversellIssue: e.target.checked })} /> 是否超賣/場次異常</label>

              <label style={{ display: 'block', marginTop: 8 }}>備註
                <textarea value={selected.note || ''} onChange={(e) => setSelected({ ...selected, note: e.target.value })} rows={3} style={{ width: '100%' }} />
              </label>

              <button onClick={saveSelected} disabled={saving} style={{ marginTop: 8 }}>{saving ? '儲存中…' : '儲存'}</button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

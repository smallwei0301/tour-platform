'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Preset = 'today' | '7d' | '30d' | 'custom';

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>('7d');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (preset !== 'custom') {
      p.set('preset', preset);
    } else {
      if (fromDate) p.set('from', `${fromDate}T00:00:00.000Z`);
      if (toDate) p.set('to', `${toDate}T23:59:59.999Z`);
    }
    return p.toString();
  }, [preset, fromDate, toDate]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/dashboard/summary?${query}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setData(j?.data || null))
      .finally(() => setLoading(false));
  }, [query]);

  if (loading) return <main style={{ padding: 24 }}>載入中…</main>;
  if (!data) return <main style={{ padding: 24 }}>無法載入 dashboard</main>;

  const kpi = data.kpi || {};
  const trends = Array.isArray(data.trends) ? data.trends : [];
  const maxOrders = Math.max(1, ...trends.map((t: any) => Number(t.orders || 0)));

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin Dashboard</h1>
      <p style={{ color: '#666' }}>Orders / Refunds / Guides / Operations 一頁整合</p>

      {/* quick filter */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0 16px' }}>
        <strong>時間範圍：</strong>
        {(['today', '7d', '30d'] as Preset[]).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #d0d7de',
              background: preset === p ? '#e8f4ee' : '#fff'
            }}
          >
            {p === 'today' ? '今天' : p === '7d' ? '近 7 日' : '近 30 日'}
          </button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #d0d7de',
            background: preset === 'custom' ? '#e8f4ee' : '#fff'
          }}
        >
          自訂
        </button>

        {preset === 'custom' && (
          <>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <span>~</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </>
        )}
      </div>

      {/* KPI cards with drill-down */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, margin: '12px 0 18px' }}>
        <Link href="/admin/orders?status=pending_payment" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'block' }}>總訂單<br /><strong>{kpi.totalOrders || 0}</strong></Link>
        <Link href="/admin/orders?status=paid" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'block' }}>待處理訂單<br /><strong>{kpi.pendingOrders || 0}</strong></Link>
        <Link href="/admin/refunds" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'block' }}>待處理退款<br /><strong>{kpi.pendingRefunds || 0}</strong></Link>
        <Link href="/admin/guides?status=pending" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'block' }}>待審核導遊<br /><strong>{kpi.pendingGuideApps || 0}</strong></Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 18 }}>
        <Link href="/admin/operations-tracking" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'block' }}>總 GMV<br /><strong>NT${Number(kpi.totalGmv || 0).toLocaleString()}</strong></Link>
        <Link href="/admin/operations-tracking" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'block' }}>平台收入<br /><strong>NT${Number(kpi.totalCommissionTwd || 0).toLocaleString()}</strong></Link>
        <Link href="/admin/operations-tracking" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'block' }}>健康訂單率<br /><strong>{kpi.healthyOrderRate || 0}%</strong></Link>
        <Link href="/admin/operations-tracking" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'block' }}>例外事件率<br /><strong>{kpi.exceptionRate || 0}%</strong></Link>
      </div>

      {/* mini trend chart */}
      <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>近 7 日趨勢（訂單數）</h3>
        {trends.length === 0 ? (
          <p style={{ color: '#666' }}>無資料</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${trends.length}, minmax(0,1fr))`, gap: 8, alignItems: 'end', minHeight: 140 }}>
            {trends.map((t: any) => {
              const h = Math.max(8, Math.round((Number(t.orders || 0) / maxOrders) * 100));
              return (
                <div key={t.date} style={{ textAlign: 'center' }}>
                  <div title={`${t.date} orders=${t.orders}`} style={{ height: `${h}px`, background: '#1B6B4A', borderRadius: '6px 6px 0 0' }} />
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{t.date.slice(5)}</div>
                  <div style={{ fontSize: 12 }}>{t.orders}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>待處理訂單</h3>
          {(data.queues?.orders || []).length === 0 ? <p style={{ color: '#666' }}>無</p> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {data.queues.orders.map((o: any) => <li key={o.id}>{o.id} · {o.status}</li>)}
            </ul>
          )}
          <Link href="/admin/orders">前往訂單管理 →</Link>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>待處理退款</h3>
          {(data.queues?.refunds || []).length === 0 ? <p style={{ color: '#666' }}>無</p> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {data.queues.refunds.map((r: any) => <li key={r.id}>{r.orderId} · {r.status}</li>)}
            </ul>
          )}
          <Link href="/admin/refunds">前往退款管理 →</Link>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>待審核導遊</h3>
          {(data.queues?.guides || []).length === 0 ? <p style={{ color: '#666' }}>無</p> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {data.queues.guides.map((g: any) => <li key={g.id}>{g.fullName} · {g.city}</li>)}
            </ul>
          )}
          <Link href="/admin/guides">前往導遊審核 →</Link>
        </section>
      </div>

      <div style={{ marginTop: 14 }}>
        <Link href="/admin/operations-tracking">前往 Operations Tracking →</Link>
      </div>
    </main>
  );
}

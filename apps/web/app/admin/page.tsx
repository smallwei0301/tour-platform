'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Preset = 'today' | '7d' | '30d' | 'custom';
type TrendMetric = 'orders' | 'refunds' | 'guides';

function cardStyle(active = false): React.CSSProperties {
  return {
    border: active ? '1px solid #1B6B4A' : '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 12,
    display: 'block',
    background: active ? '#f2fbf6' : '#fff',
    transition: 'all 0.15s ease'
  };
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>('7d');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('orders');

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

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Admin Dashboard</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ height: 78, borderRadius: 10, background: 'linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6)' }} />
          ))}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Admin Dashboard</h1>
        <p style={{ color: '#b42318' }}>無法載入 dashboard，請稍後再試。</p>
      </main>
    );
  }

  const kpi = data.kpi || {};
  const trends = Array.isArray(data.trends) ? data.trends : [];
  const maxValue = Math.max(1, ...trends.map((t: any) => Number(t[trendMetric] || 0)));

  const badgeLabel = preset === 'today' ? '今天' : preset === '7d' ? '近 7 日' : preset === '30d' ? '近 30 日' : '自訂';

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
          <p style={{ color: '#666', margin: '6px 0 0' }}>Orders / Refunds / Guides / Operations 一頁整合</p>
        </div>
        <span style={{ fontSize: 12, color: '#1B6B4A', background: '#e9f8ef', padding: '4px 10px', borderRadius: 999 }}>範圍：{badgeLabel}</span>
      </div>

      {/* quick filter */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 16px' }}>
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

      <div style={{ marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/admin/settings/kpi" style={{ color: '#1B6B4A', textDecoration: 'underline' }}>前往 KPI 計算設定 →</Link>
        <Link href="/admin/settings/security" style={{ color: '#1B6B4A', textDecoration: 'underline' }}>前往 Admin 安全設定 →</Link>
      </div>

      {/* KPI definitions */}
      <details style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, marginBottom: 14, background: '#fafafa' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>KPI 口徑說明（點我展開）</summary>
        <div style={{ marginTop: 8, fontSize: 13, color: '#444', lineHeight: 1.7 }}>
          {Object.entries(data.definitions || {}).map(([k, v]) => (
            <div key={k}><strong>{k}</strong>: {String(v)}</div>
          ))}
        </div>
      </details>

      {/* KPI cards with drill-down */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12, margin: '12px 0 18px' }}>
        <Link href="/admin/orders" style={cardStyle()}><div>總訂單</div><strong>{kpi.totalOrders || 0}</strong></Link>
        <Link href="/admin/orders?status=paid" style={cardStyle()}><div>待處理訂單</div><strong>{kpi.pendingOrders || 0}</strong></Link>
        <Link href="/admin/refunds" style={cardStyle()}><div>待處理退款</div><strong>{kpi.pendingRefunds || 0}</strong></Link>
        <Link href="/admin/guides?status=pending" style={cardStyle()}><div>待審核導遊</div><strong>{kpi.pendingGuideApps || 0}</strong></Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
        <Link href="/admin/operations-tracking" style={cardStyle()}><div>總 GMV</div><strong>NT${Number(kpi.totalGmv || 0).toLocaleString()}</strong></Link>
        <Link href="/admin/operations-tracking" style={cardStyle()}><div>平台收入</div><strong>NT${Number(kpi.totalCommissionTwd || 0).toLocaleString()}</strong></Link>
        <Link href="/admin/operations-tracking" style={cardStyle()}><div>健康訂單率</div><strong>{kpi.healthyOrderRate || 0}%</strong></Link>
        <Link href="/admin/operations-tracking" style={cardStyle()}><div>例外事件率</div><strong>{kpi.exceptionRate || 0}%</strong></Link>
      </div>

      {/* mini trend chart */}
      <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>近 7 日趨勢</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['orders', 'refunds', 'guides'] as TrendMetric[]).map((m) => (
              <button key={m} onClick={() => setTrendMetric(m)} style={{ border: '1px solid #d0d7de', borderRadius: 8, padding: '4px 8px', background: trendMetric === m ? '#e8f4ee' : '#fff' }}>
                {m === 'orders' ? '訂單' : m === 'refunds' ? '退款' : '導遊申請'}
              </button>
            ))}
          </div>
        </div>

        {trends.length === 0 ? (
          <p style={{ color: '#666' }}>無資料</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${trends.length}, minmax(0,1fr))`, gap: 8, alignItems: 'end', minHeight: 140, marginTop: 10 }}>
            {trends.map((t: any) => {
              const value = Number(t[trendMetric] || 0);
              const h = Math.max(8, Math.round((value / maxValue) * 100));
              const color = trendMetric === 'orders' ? '#1B6B4A' : trendMetric === 'refunds' ? '#E8834D' : '#4C78A8';
              return (
                <div key={t.date} style={{ textAlign: 'center' }}>
                  <div title={`${t.date} ${trendMetric}=${value}`} style={{ height: `${h}px`, background: color, borderRadius: '6px 6px 0 0' }} />
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{t.date.slice(5)}</div>
                  <div style={{ fontSize: 12 }}>{value}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 14 }}>
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>待處理訂單</h3>
          {(data.queues?.orders || []).length === 0 ? <p style={{ color: '#666' }}>🎉 目前無待處理訂單</p> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {data.queues.orders.map((o: any) => <li key={o.id}>{o.id} · {o.status}</li>)}
            </ul>
          )}
          <Link href="/admin/orders">前往訂單管理 →</Link>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>待處理退款</h3>
          {(data.queues?.refunds || []).length === 0 ? <p style={{ color: '#666' }}>🎉 目前無待處理退款</p> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {data.queues.refunds.map((r: any) => <li key={r.id}>{r.orderId} · {r.status}</li>)}
            </ul>
          )}
          <Link href="/admin/refunds">前往退款管理 →</Link>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>待審核導遊</h3>
          {(data.queues?.guides || []).length === 0 ? <p style={{ color: '#666' }}>🎉 目前無待審核導遊</p> : (
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

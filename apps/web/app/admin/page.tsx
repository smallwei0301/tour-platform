'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, PageHeader, StatusBadge, Badge, Select, LoadingSkeleton, EmptyState } from '../../src/components/admin/ui';

type Preset = 'today' | '7d' | '30d' | 'custom';
type TrendMetric = 'orders' | 'refunds' | 'guides';

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

  const kpi = data?.kpi || {};
  const trends: any[] = Array.isArray(data?.trends) ? data.trends : [];
  const maxValue = Math.max(1, ...trends.map((t) => Number(t[trendMetric] || 0)));

  const badgeLabel = preset === 'today' ? '今天' : preset === '7d' ? '近 7 日' : preset === '30d' ? '近 30 日' : '自訂';

  const KPI_CARDS = [
    { label: '總訂單', value: kpi.totalOrders || 0, href: '/admin/orders', icon: '🧾' },
    { label: '待處理訂單', value: kpi.pendingOrders || 0, href: '/admin/orders?status=paid', icon: '⏳', alert: (kpi.pendingOrders || 0) > 0 },
    { label: '待處理退款', value: kpi.pendingRefunds || 0, href: '/admin/refunds', icon: '↩️', alert: (kpi.pendingRefunds || 0) > 0 },
    { label: '待審核導遊', value: kpi.pendingGuideApps || 0, href: '/admin/guides?status=pending', icon: '🧭', alert: (kpi.pendingGuideApps || 0) > 0 },
    { label: '總 GMV', value: `NT$${Number(kpi.totalGmv || 0).toLocaleString()}`, href: '/admin/operations-tracking', icon: '💰' },
    { label: '平台收入', value: `NT$${Number(kpi.totalCommissionTwd || 0).toLocaleString()}`, href: '/admin/operations-tracking', icon: '📊' },
    { label: '健康訂單率', value: `${kpi.healthyOrderRate || 0}%`, href: '/admin/operations-tracking', icon: '✅' },
    { label: '例外事件率', value: `${kpi.exceptionRate || 0}%`, href: '/admin/operations-tracking', icon: '⚠️' },
  ];

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader
        title="Admin Dashboard"
        subtitle="訂單 · 退款 · 導遊 · 操作追蹤 一頁整合"
        actions={
          <Badge variant="success">{badgeLabel}</Badge>
        }
      />

      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Time Filter */}
        <Card data-guide="time-filter" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>時間範圍</span>
          {(['today', '7d', '30d'] as Preset[]).map((p) => (
            <button key={p} onClick={() => setPreset(p)} style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: 'none', transition: 'all 0.15s',
              background: preset === p ? 'var(--tp-primary)' : '#f1f5f9',
              color: preset === p ? '#fff' : '#6b7280',
            }}>
              {p === 'today' ? '今天' : p === '7d' ? '近 7 日' : '近 30 日'}
            </button>
          ))}
          <button onClick={() => setPreset('custom')} style={{
            padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: 'none', background: preset === 'custom' ? 'var(--tp-primary)' : '#f1f5f9',
            color: preset === 'custom' ? '#fff' : '#6b7280',
          }}>
            自訂
          </button>
          {preset === 'custom' && (
            <>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 13 }} />
              <span style={{ color: '#9ca3af' }}>~</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 13 }} />
            </>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <Link href="/admin/settings/kpi" style={{ fontSize: 13, color: 'var(--tp-primary)', textDecoration: 'underline' }}>KPI 設定</Link>
            <Link href="/admin/settings/security" style={{ fontSize: 13, color: 'var(--tp-primary)', textDecoration: 'underline' }}>安全設定</Link>
          </div>
        </Card>

        {/* KPI Cards */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 88, borderRadius: 12, background: 'linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6)' }} />
            ))}
          </div>
        ) : (
          <div data-guide="kpi-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {KPI_CARDS.map((c) => (
              <Link key={c.label} href={c.href} style={{ textDecoration: 'none' }}>
                <Card style={{
                  padding: '16px 20px', cursor: 'pointer',
                  borderColor: c.alert ? 'var(--tp-primary)' : '#e5e7eb',
                  background: c.alert ? '#f0fdf4' : '#fff',
                  transition: 'box-shadow 0.15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>{c.icon}</span>
                    {c.alert && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--tp-primary)', display: 'block', marginTop: 4 }} />}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: c.alert ? 'var(--tp-primary)' : '#111', letterSpacing: '-0.5px' }}>{c.value}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, fontWeight: 500 }}>{c.label}</div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* KPI Definitions */}
        {data?.definitions && (
          <details data-guide="kpi-explanation" style={{ borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>
            <summary style={{ padding: '12px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#374151', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              📋 KPI 口徑說明
            </summary>
            <div style={{ padding: '0 20px 16px', fontSize: 13, color: '#6b7280', lineHeight: 1.8, borderTop: '1px solid #f0f0f0' }}>
              {Object.entries(data.definitions).map(([k, v]) => (
                <div key={k}><strong style={{ color: '#374151' }}>{k}</strong>：{String(v)}</div>
              ))}
            </div>
          </details>
        )}

        {/* Trend Chart */}
        <Card data-guide="trend-chart">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>趨勢圖</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['orders', 'refunds', 'guides'] as TrendMetric[]).map((m) => (
                <button key={m} onClick={() => setTrendMetric(m)} style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: trendMetric === m ? 'var(--tp-primary)' : '#f1f5f9',
                  color: trendMetric === m ? '#fff' : '#6b7280',
                }}>
                  {m === 'orders' ? '訂單' : m === 'refunds' ? '退款' : '導遊申請'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: '20px' }}>
            {trends.length === 0 ? (
              <EmptyState message="無趨勢資料" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${trends.length}, minmax(0,1fr))`, gap: 8, alignItems: 'end', minHeight: 120 }}>
                {trends.map((t: any) => {
                  const value = Number(t[trendMetric] || 0);
                  const h = Math.max(8, Math.round((value / maxValue) * 100));
                  const color = trendMetric === 'orders' ? 'var(--tp-primary)' : trendMetric === 'refunds' ? '#e8834d' : '#4C78A8';
                  return (
                    <div key={t.date} style={{ textAlign: 'center' }}>
                      <div title={`${t.date} = ${value}`} style={{ height: `${h}px`, background: color, borderRadius: '6px 6px 0 0', transition: 'height 0.3s' }} />
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{t.date.slice(5)}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{value}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Queues */}
        <div data-guide="pending-orders" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 16 }}>
          {[
            { title: '待處理訂單', items: data?.queues?.orders || [], href: '/admin/orders', renderItem: (o: any) => `${o.id} · ${o.status}`, empty: '🎉 無待處理訂單' },
            { title: '待處理退款', items: data?.queues?.refunds || [], href: '/admin/refunds', renderItem: (r: any) => `${r.orderId} · ${r.status}`, empty: '🎉 無待處理退款' },
            { title: '待審核導遊', items: data?.queues?.guides || [], href: '/admin/guides', renderItem: (g: any) => `${g.fullName} · ${g.city}`, empty: '🎉 無待審核導遊' },
          ].map((section) => (
            <Card key={section.title}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111' }}>{section.title}</h3>
                <Link href={section.href} style={{ fontSize: 12, color: 'var(--tp-primary)' }}>查看全部 →</Link>
              </div>
              <div style={{ padding: '12px 18px' }}>
                {loading ? <LoadingSkeleton rows={3} /> :
                  section.items.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>{section.empty}</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                      {section.items.map((item: any, i: number) => (
                        <li key={i} style={{ fontSize: 13, color: '#374151', padding: '6px 0', borderBottom: i < section.items.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                          {section.renderItem(item)}
                        </li>
                      ))}
                    </ul>
                  )
                }
              </div>
            </Card>
          ))}
        </div>

        <div>
          <Link href="/admin/operations-tracking" style={{ fontSize: 14, color: 'var(--tp-primary)', fontWeight: 600 }}>
            前往 Operations Tracking →
          </Link>
        </div>

      </div>
    </div>
  );
}

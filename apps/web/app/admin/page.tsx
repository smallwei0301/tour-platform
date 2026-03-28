'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/dashboard/summary', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setData(j?.data || null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main style={{ padding: 24 }}>載入中…</main>;
  if (!data) return <main style={{ padding: 24 }}>無法載入 dashboard</main>;

  const kpi = data.kpi || {};

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin Dashboard</h1>
      <p style={{ color: '#666' }}>Orders / Refunds / Guides / Operations 一頁整合</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, margin: '12px 0 18px' }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>總訂單<br /><strong>{kpi.totalOrders || 0}</strong></div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>待處理訂單<br /><strong>{kpi.pendingOrders || 0}</strong></div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>待處理退款<br /><strong>{kpi.pendingRefunds || 0}</strong></div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>待審核導遊<br /><strong>{kpi.pendingGuideApps || 0}</strong></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 18 }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>總 GMV<br /><strong>NT${Number(kpi.totalGmv || 0).toLocaleString()}</strong></div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>平台收入<br /><strong>NT${Number(kpi.totalCommissionTwd || 0).toLocaleString()}</strong></div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>健康訂單率<br /><strong>{kpi.healthyOrderRate || 0}%</strong></div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>例外事件率<br /><strong>{kpi.exceptionRate || 0}%</strong></div>
      </div>

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

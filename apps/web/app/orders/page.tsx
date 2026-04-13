'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchMyOrders } from '../../src/lib/client-api'";

function toLabel(status: string) {
  if (status === 'paid' || status === 'confirmed') return '即將出發';
  if (status === 'completed') return '已完成';
  if (status?.includes('cancelled') || status === 'refunded') return '已取消';
  return '處理中';
}

export default function OrdersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [tab, setTab] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyOrders()
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (tab === 'all') return rows;
    if (tab === 'upcoming') return rows.filter((r) => ['paid', 'confirmed'].includes(r.status));
    if (tab === 'completed') return rows.filter((r) => r.status === 'completed');
    return rows.filter((r) => r.status?.includes('cancelled') || r.status === 'refunded');
  }, [rows, tab]);

  return (
    <main className="tp-container tp-orders-page">
      <h1>我的訂單</h1>

      <div className="tp-order-tabs">
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>全部</button>
        <button className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}>即將出發</button>
        <button className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>已完成</button>
        <button className={tab === 'cancelled' ? 'active' : ''} onClick={() => setTab('cancelled')}>已取消</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--tp-muted)' }}>載入中…</p>
      ) : filtered.length === 0 ? (
        <div className="tp-step-card">
          <p>目前沒有訂單。</p>
          <Link href="/activities" className="tp-btn tp-btn-primary">去看看行程</Link>
        </div>
      ) : (
        <section className="tp-order-section">
          {filtered.map((o) => {
            const statusLabel = toLabel(o.status);
            const isUpcoming = statusLabel === '即將出發';
            const when = o.scheduleStartAt ? new Date(o.scheduleStartAt).toLocaleString('zh-TW') : '—';
            return (
              <article key={o.id} className="tp-order-card">
                <div className="tp-order-cover" />
                <div className="tp-order-body">
                  <h3>{o.title || o.experienceSlug || '行程'}</h3>
                  <p>{when} · 人數：{o.peopleCount || 1}</p>
                  <p>訂單編號：{o.id}</p>
                  <strong>NT${Number(o.totalTwd || 0).toLocaleString()}</strong>
                </div>
                <div className="tp-order-side">
                  <span className={`tp-status ${isUpcoming ? 'tp-status-upcoming' : 'tp-status-completed'}`}>{statusLabel}</span>
                  <div className="tp-order-actions">
                    <Link className="tp-btn tp-btn-ghost" href={`/orders/${o.id}`}>查看訂單</Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

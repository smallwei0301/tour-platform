'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import EmptyState from '../../src/components/guards/EmptyState';
import InlineErrorState from '../../src/components/guards/InlineErrorState';
import PageSkeleton from '../../src/components/guards/PageSkeleton';
import { fetchMyOrders } from '../../src/lib/client-api';

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
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyOrders();
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : '無法取得訂單資料');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const filtered = useMemo(() => {
    if (tab === 'all') return rows;
    if (tab === 'upcoming') return rows.filter((r) => ['paid', 'confirmed'].includes(r.status));
    if (tab === 'completed') return rows.filter((r) => r.status === 'completed');
    return rows.filter((r) => r.status?.includes('cancelled') || r.status === 'refunded');
  }, [rows, tab]);

  return (
    <main className="tp-container tp-orders-page tp-editorial-page midao-page">
      <div className="tp-breadcrumb tp-editorial-breadcrumb">首頁 &gt; 我的帳戶 &gt; 我的訂單</div>
      <section
        className="tp-editorial-hero"
        style={{
          backgroundImage:
            'linear-gradient(rgba(14, 26, 20, 0.4), rgba(14, 26, 20, 0.56)), url(/images/midao-style/why-hero.png)',
        }}
      >
        <h1>我的訂單</h1>
        <p>在這裡管理你的行程狀態、出發時間與退款進度，讓每一段旅程都清楚安心。</p>
      </section>

      <div className="tp-order-tabs">
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>全部</button>
        <button className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}>即將出發</button>
        <button className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>已完成</button>
        <button className={tab === 'cancelled' ? 'active' : ''} onClick={() => setTab('cancelled')}>已取消</button>
      </div>

      {loading ? (
        <PageSkeleton title="載入訂單中" lines={4} />
      ) : error ? (
        <InlineErrorState title="訂單載入失敗" message={error} onRetry={() => void loadOrders()} />
      ) : filtered.length === 0 ? (
        <EmptyState title="目前沒有訂單" description="先挑一個喜歡的行程開始吧。" ctaHref="/activities" ctaLabel="去看看行程" />
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

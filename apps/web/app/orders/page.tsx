'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const TABS = [
  { key: 'all' as const, label: '全部', id: 'orders-tab-all' },
  { key: 'upcoming' as const, label: '即將出發', id: 'orders-tab-upcoming' },
  { key: 'completed' as const, label: '已完成', id: 'orders-tab-completed' },
  { key: 'cancelled' as const, label: '已取消', id: 'orders-tab-cancelled' },
] as const;

export default function OrdersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [tab, setTab] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    const nextIdx =
      e.key === 'ArrowRight' ? (idx + 1) % TABS.length :
      e.key === 'ArrowLeft' ? (idx - 1 + TABS.length) % TABS.length :
      null;
    if (nextIdx === null) return;
    e.preventDefault();
    setTab(TABS[nextIdx].key);
    tabRefs.current[nextIdx]?.focus();
  }

  const activeTabId = TABS.find((t) => t.key === tab)?.id ?? 'orders-tab-all';

  return (
    <main className="tp-container tp-orders-page">
      <h1>我的訂單</h1>

      <div className="tp-order-tabs" role="tablist" aria-label="訂單篩選">
        {TABS.map((t, idx) => (
          <button
            key={t.key}
            ref={(el) => { tabRefs.current[idx] = el; }}
            id={t.id}
            role="tab"
            aria-selected={tab === t.key}
            aria-controls="orders-tabpanel"
            tabIndex={tab === t.key ? 0 : -1}
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => handleTabKeyDown(e, idx)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="orders-tabpanel" role="tabpanel" aria-labelledby={activeTabId}>
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
      </div>
    </main>
  );
}

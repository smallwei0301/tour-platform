'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../src/lib/supabase/client';

type Order = {
  id: string;
  status: string;
  totalTwd: number;
  title?: string | null;
  peopleCount?: number;
  contactEmail?: string | null;
  createdAt?: string | null;
  paidAt?: string | null;
  scheduleId?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: '待付款',
  paid: '已付款',
  confirmed: '已確認',
  rejected: '已拒絕',
  cancelled_by_user: '已取消',
  cancelled_by_guide: '導遊取消',
  completed: '已完成',
  refund_pending: '退款申請中',
  refunded: '已退款',
};

function statusClass(status: string) {
  if (['paid', 'confirmed'].includes(status)) return 'success';
  if (['pending_payment', 'refund_pending'].includes(status)) return 'warning';
  if (['rejected', 'cancelled_by_user', 'cancelled_by_guide', 'refunded'].includes(status)) return 'danger';
  return 'neutral';
}

export default function MyOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [tab, setTab] = useState<'all' | 'active' | 'done'>('all');

  const fetchOrders = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/me/orders', { cache: 'no-store' });
      if (res.status === 401) {
        router.replace(`/login?next=${encodeURIComponent('/me/orders')}`);
        return;
      }
      const j = await res.json();
      setOrders(j.data || []);
    } catch {
      setErr('查詢失敗，請稍後再試');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent('/me/orders')}`);
        return;
      }
      setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || '');
      setAuthChecking(false);
      void fetchOrders();
    });
  }, []);

  const filteredOrders = useMemo(() => {
    if (tab === 'active') return orders.filter((order) => ['pending_payment', 'paid', 'confirmed', 'refund_pending'].includes(order.status));
    if (tab === 'done') return orders.filter((order) => ['completed', 'refunded', 'cancelled_by_user', 'cancelled_by_guide', 'rejected'].includes(order.status));
    return orders;
  }, [orders, tab]);

  if (authChecking) {
    return <div className="tp-container tp-member-orders-page"><div className="tp-member-empty">驗證登入中…</div></div>;
  }

  return (
    <main className="tp-container tp-member-orders-page">
      <section className="tp-member-hero">
        <p className="tp-member-kicker">member orders</p>
        <h1>你的行程、付款與退款進度，都在同一個旅程看板。</h1>
        <p>
          保留 `/api/me/orders` 與原本登入驗證流程，只把會員訂單頁改成和封面一致的 MIDAO 視覺語言。
          {userName ? ` 歡迎回來，${userName}。` : ''}
        </p>
        <div className="tp-member-hero-meta">
          <span className="tp-member-chip">📦 全部訂單</span>
          <span className="tp-member-chip">💳 付款狀態</span>
          <span className="tp-member-chip">🧾 退款進度</span>
        </div>
      </section>

      <section className="tp-member-panel" style={{ marginTop: 18 }}>
        <div className="tp-member-actions-row" style={{ marginTop: 0 }}>
          {[
            { key: 'all', label: '全部' },
            { key: 'active', label: '進行中' },
            { key: 'done', label: '已完成 / 已關閉' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={tab === item.key ? 'tp-btn tp-btn-primary' : 'tp-btn tp-btn-ghost'}
              onClick={() => setTab(item.key as typeof tab)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {err && <div className="tp-member-panel" style={{ marginTop: 18 }}><div className="tp-member-status danger">⚠️ {err}</div></div>}

      {loading ? (
        <div className="tp-member-panel" style={{ marginTop: 18 }}><div className="tp-member-empty">載入訂單中…</div></div>
      ) : filteredOrders.length === 0 ? (
        <div className="tp-member-panel" style={{ marginTop: 18 }}>
          <div className="tp-member-empty">
            <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
            <p>目前還沒有符合條件的訂單</p>
            <div className="tp-member-actions-row" style={{ justifyContent: 'center' }}>
              <button type="button" className="tp-btn tp-btn-primary" onClick={() => router.push('/activities')}>
                探索行程
              </button>
            </div>
          </div>
        </div>
      ) : (
        <section className="tp-member-card-list" style={{ marginTop: 18 }}>
          {filteredOrders.map((order) => (
            <article key={order.id} className="tp-member-order-card">
              <div className="tp-member-order-cover" />
              <div>
                <div className="tp-member-data-top">
                  <div>
                    <strong>{order.title || '行程訂單'}</strong>
                    <div className="tp-member-meta">
                      建立時間：{order.createdAt ? new Date(order.createdAt).toLocaleDateString('zh-TW') : '—'}
                    </div>
                  </div>
                  <span className={`tp-member-status ${statusClass(order.status)}`}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>
                <div className="tp-member-actions-row">
                  <span className="tp-member-chip">👥 {order.peopleCount ?? '—'} 人</span>
                  {order.paidAt && <span className="tp-member-chip">已付款</span>}
                  {order.contactEmail && <span className="tp-member-chip">{order.contactEmail}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong style={{ display: 'block', fontSize: 22, marginBottom: 12 }}>NT$ {(order.totalTwd ?? 0).toLocaleString()}</strong>
                <button type="button" className="tp-btn tp-btn-ghost" onClick={() => router.push(`/me/orders/${order.id}`)}>
                  查看詳情
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

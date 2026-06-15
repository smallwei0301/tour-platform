'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../src/lib/supabase/client';
import { MemberTabs } from '../../../src/components/me/MemberTabs';

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

// 狀態膠囊維持語意化淺底色票（在深綠卡片上仍清晰），與訂單詳情頁一致。
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending_payment: { bg: '#fef3c7', color: '#92400e' },
  paid:            { bg: '#dbeafe', color: '#1e40af' },
  confirmed:       { bg: '#d1fae5', color: '#065f46' },
  rejected:        { bg: '#fee2e2', color: '#991b1b' },
  cancelled_by_user:  { bg: '#e5e7eb', color: '#374151' },
  cancelled_by_guide: { bg: '#e5e7eb', color: '#374151' },
  completed:       { bg: '#ede9fe', color: '#5b21b6' },
  refund_pending:  { bg: '#ffedd5', color: '#9a3412' },
  refunded:        { bg: '#e5e7eb', color: '#374151' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_COLORS[status] || { bg: '#e5e7eb', color: '#374151' };
  return (
    <span style={{
      background: style.bg,
      color: style.color,
      borderRadius: 999,
      padding: '3px 10px',
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

const pageStyle: React.CSSProperties = {
  paddingTop: 32,
  paddingBottom: 56,
  minHeight: '70vh',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--tp-serif)',
  fontSize: 'clamp(22px, 5vw, 28px)',
  fontWeight: 700,
  color: 'var(--tp-text)',
  margin: '0 0 4px',
  letterSpacing: '0.02em',
};

export default function MyOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    // 直接打 API（route 端已驗證 auth），401 才導去登入 —— 不再用 client getUser 擋住資料載入，
    // 省掉「client getUser → 再 server getUser」的序列雙重往返。
    fetchOrders();
    // 問候語用的名稱在背景取得，不阻塞列表渲染。
    createClient().auth.getUser().then(({ data }) => {
      const user = data.user;
      if (user) setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || '');
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <main className="tp-container" style={pageStyle}>
      <h1 style={titleStyle} data-testid="my-orders-title">我的訂單</h1>
      <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: '0 0 20px' }}>
        {userName ? `歡迎回來，${userName}` : '查看你的所有行程訂單'}
      </p>
      <MemberTabs />

      {err && <p style={{ color: 'var(--tp-accent)', fontSize: 13, marginBottom: 16 }}>{err}</p>}

      {loading && <p style={{ color: 'var(--tp-muted)', textAlign: 'center', padding: '40px 0' }}>載入訂單中…</p>}

      {!loading && orders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--tp-muted)' }} data-testid="orders-empty">
          <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.85 }}>🧭</div>
          <p style={{ fontSize: 14, margin: '0 0 18px' }}>目前還沒有訂單</p>
          <Link href="/activities" className="tp-btn tp-btn-primary" style={{ fontSize: 14 }}>
            探索行程
          </Link>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {orders.map(order => (
            <div
              key={order.id}
              data-testid="order-list-item"
              data-order-id={order.id}
              data-order-status={order.status}
              className="tp-card"
              role="link"
              tabIndex={0}
              style={{ padding: 18, cursor: 'pointer' }}
              onClick={() => router.push(`/me/orders/${order.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/me/orders/${order.id}`); }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: 'var(--tp-text)',
                      marginBottom: 3,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: 1.4,
                    }}
                  >
                    {order.title || '行程訂單'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tp-muted)' }}>
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString('zh-TW') : '—'}
                  </div>
                </div>
                <StatusBadge status={order.status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTop: '1px solid var(--tp-border)', paddingTop: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--tp-muted)' }}>{order.peopleCount ?? '—'} 人</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--tp-gold-strong)' }}>
                  NT$ {(order.totalTwd ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending_payment: { bg: '#fef3c7', color: '#92400e' },
  paid:            { bg: '#dbeafe', color: '#1e40af' },
  confirmed:       { bg: '#d1fae5', color: '#065f46' },
  rejected:        { bg: '#fee2e2', color: '#991b1b' },
  cancelled_by_user:  { bg: '#f3f4f6', color: '#374151' },
  cancelled_by_guide: { bg: '#f3f4f6', color: '#374151' },
  completed:       { bg: '#ede9fe', color: '#5b21b6' },
  refund_pending:  { bg: '#ffedd5', color: '#9a3412' },
  refunded:        { bg: '#f3f4f6', color: '#374151' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_COLORS[status] || { bg: '#f3f4f6', color: '#374151' };
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

export default function MyOrdersPage() {
  const params = useSearchParams();
  const router = useRouter();
  const initialEmail = params.get('email') || '';

  const [email, setEmail] = useState(initialEmail);
  const [submittedEmail, setSubmittedEmail] = useState(initialEmail);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchOrders = async (emailVal: string) => {
    if (!emailVal.trim()) return;
    setLoading(true);
    setErr(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/me/orders?contactEmail=${encodeURIComponent(emailVal.trim())}`, { cache: 'no-store' });
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
    if (initialEmail) fetchOrders(initialEmail);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedEmail(email);
    router.replace(`/me/orders?email=${encodeURIComponent(email)}`);
    fetchOrders(email);
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: 640,
    margin: '40px auto',
    padding: '0 16px',
    fontFamily: 'system-ui, sans-serif',
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: 20,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    marginBottom: 12,
    cursor: 'pointer',
    transition: 'box-shadow 0.15s',
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    border: '1px solid #d1d5db',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const btnStyle: React.CSSProperties = {
    padding: '10px 20px',
    background: '#ec4899',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={containerStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 6 }}>我的訂單</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>輸入訂購時使用的 Email 查詢訂單</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        <input
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />
        <button type="submit" style={btnStyle} disabled={loading}>
          {loading ? '查詢中…' : '查詢'}
        </button>
      </form>

      {err && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 16 }}>{err}</p>}

      {loading && <p style={{ color: '#9ca3af', textAlign: 'center' }}>載入中…</p>}

      {!loading && searched && orders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
          <p style={{ fontSize: 14 }}>找不到訂單，請確認 Email 是否正確</p>
        </div>
      )}

      {orders.map(order => (
        <div
          key={order.id}
          style={cardStyle}
          onClick={() => router.push(`/me/orders/${order.id}?email=${encodeURIComponent(submittedEmail)}`)}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ flex: 1, marginRight: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 2 }}>
                {order.title || '行程訂單'}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                {order.createdAt ? new Date(order.createdAt).toLocaleDateString('zh-TW') : '—'}
              </div>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>{order.peopleCount ?? '—'} 人</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#ec4899' }}>
              NT$ {(order.totalTwd ?? 0).toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

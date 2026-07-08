'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useClientLocale } from '../../../src/i18n/use-client-locale';
import { getClientNamespace } from '../../../src/i18n/client-nav-messages';

type OrderDetail = {
  id: string;
  status: string;
  totalTwd: number;
  title?: string | null;
  peopleCount?: number;
  contactName?: string | null;
  contactEmail?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending_payment: '#f59e0b',
  paid: '#3b82f6',
  confirmed: '#10b981',
  cancelled_by_user: '#6b7280',
  cancelled_by_guide: '#6b7280',
  rejected: '#ef4444',
  completed: '#8b5cf6',
  refund_pending: '#f97316',
  refunded: '#6b7280',
};

export default function OrderSuccessPage() {
  const params = useSearchParams();
  const locale = useClientLocale();
  const m = getClientNamespace(locale, 'orderSuccess');
  const statusLabels = m.status as Record<string, string>;
  const orderId = params.get('orderId') || '';
  const email = params.get('email') || '';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    fetch(`/api/v2/orders/${encodeURIComponent(orderId)}?contactEmail=${encodeURIComponent(email)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setOrder(j.data || null))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderId, email]);

  const containerStyle: React.CSSProperties = {
    maxWidth: 480,
    margin: '48px auto',
    padding: '0 16px',
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    textAlign: 'left',
    marginTop: 24,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #f3f4f6',
    fontSize: 14,
  };

  const status = order?.status || '';
  const statusColor = STATUS_COLORS[status] || '#6b7280';
  const statusLabel = statusLabels[status] || status;

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: 56, marginBottom: 8 }}>🎊</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
        {m.title}
      </h1>

      {loading ? (
        <p style={{ color: '#9ca3af', marginTop: 16 }}>{m.loading}</p>
      ) : order ? (
        <>
          <div style={{
            display: 'inline-block',
            background: statusColor,
            color: '#fff',
            borderRadius: 999,
            padding: '4px 16px',
            fontSize: 13,
            fontWeight: 700,
            marginTop: 8,
          }}>
            {statusLabel}
          </div>

          <div style={cardStyle}>
            <div style={rowStyle}>
              <span style={{ color: '#6b7280' }}>{m.orderNumber}</span>
              <span data-testid="order-id" style={{ fontWeight: 600, fontSize: 12, wordBreak: 'break-all' }}>{order.id}</span>
            </div>
            <div style={rowStyle}>
              <span style={{ color: '#6b7280' }}>{m.trip}</span>
              <span style={{ fontWeight: 600 }}>{order.title || '—'}</span>
            </div>
            <div style={rowStyle}>
              <span style={{ color: '#6b7280' }}>{m.people}</span>
              <span style={{ fontWeight: 600 }}>{m.peopleUnit.replace('{n}', String(order.peopleCount ?? '—'))}</span>
            </div>
            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={{ color: '#6b7280' }}>{m.amount}</span>
              <span style={{ fontWeight: 800, color: '#a8511f', fontSize: 16 }}>
                NT$ {(order.totalTwd ?? 0).toLocaleString()}
              </span>
            </div>
          </div>
        </>
      ) : (
        <p data-testid="order-id" style={{ color: '#9ca3af', marginTop: 16 }}>{m.orderNumberPrefix}{orderId || 'N/A'}</p>
      )}

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link
          href={`/me/orders?email=${encodeURIComponent(email)}`}
          data-testid="view-orders-btn"
          style={{
            display: 'block',
            padding: '13px 0',
            background: '#a8511f',
            color: '#fff',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 15,
            textDecoration: 'none',
          }}
        >
          {m.viewOrders}
        </Link>
        <Link
          href="/activities"
          style={{
            display: 'block',
            padding: '13px 0',
            background: '#f1f5f9',
            color: '#374151',
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          {m.exploreMore}
        </Link>
      </div>
    </div>
  );
}

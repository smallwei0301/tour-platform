'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../src/lib/supabase/client';
import { MemberTabs } from '../../../src/components/me/MemberTabs';
import { PointsBalanceChip } from '../../../src/components/me/PointsBalanceChip';
import { useMeResource } from '../../../src/lib/use-me-resource';
import { useClientLocale } from '../../../src/i18n/use-client-locale';
import { getClientNamespace } from '../../../src/i18n/client-nav-messages';
import { describePaymentRemaining } from '../../../src/lib/payment-deadline.mjs';

type Order = {
  id: string;
  status: string;
  totalTwd: number;
  title?: string | null;
  peopleCount?: number;
  contactEmail?: string | null;
  createdAt?: string | null;
  paidAt?: string | null;
  paymentDeadlineAt?: string | null;
  scheduleId?: string | null;
};

// 狀態膠囊維持語意化淺底色票（在深綠卡片上仍清晰），與訂單詳情頁一致。
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending_payment: { bg: '#fef3c7', color: '#92400e' },
  paid:            { bg: '#dbeafe', color: '#1e40af' },
  confirmed:       { bg: '#d1fae5', color: '#065f46' },
  rejected:        { bg: '#fee2e2', color: '#991b1b' },
  cancelled_by_user:  { bg: '#e5e7eb', color: '#374151' },
  cancelled_by_guide: { bg: '#e5e7eb', color: '#374151' },
  cancelled_unpaid:   { bg: '#fee2e2', color: '#991b1b' },
  completed:       { bg: '#ede9fe', color: '#5b21b6' },
  refund_pending:  { bg: '#ffedd5', color: '#9a3412' },
  refunded:        { bg: '#e5e7eb', color: '#374151' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_COLORS[status] || { bg: '#e5e7eb', color: '#374151' };
  const statusLabels = getClientNamespace(useClientLocale(), 'orders').status as Record<string, string>;
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
      {statusLabels[status] || status}
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
  const locale = useClientLocale();
  const m = getClientNamespace(locale, 'orders');
  const dateLocale = locale === 'zh-Hant' ? 'zh-TW' : 'en-US';
  const [userName, setUserName] = useState<string>('');
  // stale-while-revalidate：切回本分頁時用快取瞬開，背景更新。401 才導登入。
  const { data, loading, error: err } = useMeResource<Order[]>('/api/v2/orders', {
    onUnauthorized: () => router.replace(`/login?next=${encodeURIComponent('/me/orders')}`),
  });
  const orders = data ?? [];

  useEffect(() => {
    // 問候語用的名稱在背景取得，不阻塞列表渲染。
    createClient().auth.getUser().then(({ data: u }) => {
      const user = u.user;
      if (user) setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || '');
    }).catch(() => {});
  }, []);

  return (
    <main className="tp-container" style={pageStyle}>
      <h1 style={titleStyle} data-testid="my-orders-title">{m.title}</h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 20px' }}>
        <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: 0 }}>
          {userName ? m.greeting.replace('{name}', userName) : m.subtitle}
        </p>
        <PointsBalanceChip />
      </div>
      <MemberTabs />

      {err && <p style={{ color: 'var(--tp-accent)', fontSize: 13, marginBottom: 16 }}>{err}</p>}

      {loading && <p style={{ color: 'var(--tp-muted)', textAlign: 'center', padding: '40px 0' }}>{m.loading}</p>}

      {!loading && orders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--tp-muted)' }} data-testid="orders-empty">
          <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.85 }}>🧭</div>
          <p style={{ fontSize: 14, margin: '0 0 18px' }}>{m.empty}</p>
          <Link href="/activities" className="tp-btn tp-btn-primary" style={{ fontSize: 14 }}>
            {m.exploreCta}
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
                    {order.title || m.fallbackTitle}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tp-muted)' }}>
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString(dateLocale) : '—'}
                  </div>
                </div>
                <StatusBadge status={order.status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTop: '1px solid var(--tp-border)', paddingTop: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--tp-muted)' }}>{m.people.replace('{n}', String(order.peopleCount ?? '—'))}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--tp-gold-strong)' }}>
                  NT$ {(order.totalTwd ?? 0).toLocaleString()}
                </span>
              </div>

              {order.status === 'pending_payment' && order.paymentDeadlineAt && (() => {
                const r = describePaymentRemaining(order.paymentDeadlineAt!, new Date().toISOString());
                const when = new Date(order.paymentDeadlineAt!).toLocaleString(dateLocale);
                return (
                  <div
                    data-testid="order-payment-deadline"
                    style={{
                      marginTop: 12, padding: '10px 12px', borderRadius: 8,
                      background: '#fef3c7', border: '1px solid #fde68a',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: '#92400e', fontWeight: 600 }}>
                      {r.isOverdue
                        ? `${m.deadlineOverdue}`
                        : `${m.deadlinePrefix} ${when}（${m.deadlineRemaining.replace('{h}', String(r.hours)).replace('{m}', String(r.minutes))}）`}
                    </span>
                    <Link
                      href={`/me/orders/${order.id}`}
                      data-testid="order-resume-payment"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: 13, fontWeight: 700, color: '#fff', background: '#0f766e',
                        padding: '6px 14px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap',
                      }}
                    >
                      {m.resumePayment}
                    </Link>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

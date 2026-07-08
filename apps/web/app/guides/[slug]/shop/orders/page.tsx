'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMeResource } from '../../../../../src/lib/use-me-resource';
import { useTablistKeyboard } from '../../../../../src/lib/use-tablist-keyboard';

type Order = {
  id: string;
  status: string;
  totalTwd: number;
  title: string;
  peopleCount: number;
  createdAt: string;
  paidAt?: string | null;
  scheduleStartAt?: string | null;
};

type Tab = 'all' | 'pending' | 'history';

const HISTORY_STATUSES = new Set(['completed', 'cancelled_by_user', 'cancelled_by_guide', 'refunded']);

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending_payment: { text: '需付款', color: '#b45309' },
  paid: { text: '已付款', color: '#15803d' },
  confirmed: { text: '已確認', color: '#15803d' },
  completed: { text: '已完成', color: '#6d28d9' },
  cancelled_by_user: { text: '已取消', color: '#6b7280' },
  cancelled_by_guide: { text: '已取消', color: '#6b7280' },
  refund_pending: { text: '退款處理中', color: '#b45309' },
  refunded: { text: '已退款', color: '#6b7280' },
};

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} 週${wk} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function GuideShopOrdersPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [tab, setTab] = useState<Tab>('all');
  const TABS: Tab[] = ['all', 'pending', 'history'];
  const { onKeyDown, registerTab } = useTablistKeyboard<Tab>(TABS, tab, setTab);

  const { data, loading } = useMeResource<Order[]>('/api/v2/orders', {
    onUnauthorized: () => router.replace(`/login?next=${encodeURIComponent(`/guides/${slug}/shop/orders`)}`),
  });

  const orders = useMemo(() => data ?? [], [data]);
  const filtered = useMemo(() => {
    if (tab === 'pending') return orders.filter((o) => o.status === 'pending_payment');
    if (tab === 'history') return orders.filter((o) => HISTORY_STATUSES.has(o.status));
    return orders;
  }, [orders, tab]);

  return (
    <main className="tp-light-page tp-container" style={{ paddingBottom: 60, maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <Link href={`/guides/${slug}/shop`} className="tp-btn tp-btn-ghost" style={{ fontSize: 14, padding: '6px 12px' }}>←</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>預約管理</h1>
      </div>

      {/* 分頁 */}
      <div role="tablist" style={{ display: 'flex', gap: 8, marginTop: 16, background: 'var(--tp-bg-soft, #f3f4f6)', borderRadius: 12, padding: 4 }}>
        {([['all', '所有預約'], ['pending', '需付款'], ['history', '歷史預約']] as Array<[Tab, string]>).map(([key, label], i) => (
          <button key={key} role="tab" aria-selected={tab === key} data-testid={`orders-tab-${key}`}
            ref={registerTab(i)}
            onKeyDown={onKeyDown}
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: tab === key ? 'var(--tp-card-bg, #fff)' : 'transparent',
              color: tab === key ? 'var(--tp-text)' : 'var(--tp-muted)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--tp-muted)', marginTop: 24, textAlign: 'center' }}>載入中…</p>}
      {!loading && filtered.length === 0 && (
        <p data-testid="orders-empty" style={{ color: 'var(--tp-muted)', marginTop: 32, textAlign: 'center' }}>目前沒有預約。</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
        {filtered.map((o) => {
          const badge = STATUS_LABEL[o.status] || { text: o.status, color: '#6b7280' };
          return (
            <Link key={o.id} href={`/me/orders/${o.id}`} data-testid="order-card" className="tp-card"
              style={{ display: 'block', padding: 16, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{fmtDateTime(o.scheduleStartAt || o.createdAt)}</p>
                <span style={{ fontSize: 13, fontWeight: 700, color: badge.color }}>{badge.text}</span>
              </div>
              <p style={{ margin: '8px 0 0', color: 'var(--tp-muted)', fontSize: 14 }}>{o.title}・{o.peopleCount} 位</p>
              <p style={{ margin: '4px 0 0', fontWeight: 700 }}>NT${(o.totalTwd ?? 0).toLocaleString()}</p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

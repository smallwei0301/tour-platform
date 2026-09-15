'use client';

import { useCallback, useEffect, useState } from 'react';
import { C, Card, EmptyState, ErrorState, Icon, Spinner } from '../ui';

type OrderProjection = {
  id: string;
  tourTitle: string;
  scheduleDate: string | null;
  partySize: number;
  status: string;
  paymentStatus: string;
  totalTwd: number;
  createdAt: string;
};

type PageState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; orders: OrderProjection[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOrderProjection(value: unknown): value is OrderProjection {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.tourTitle === 'string'
    && (value.scheduleDate === null || typeof value.scheduleDate === 'string')
    && typeof value.partySize === 'number'
    && Number.isFinite(value.partySize)
    && typeof value.status === 'string'
    && typeof value.paymentStatus === 'string'
    && typeof value.totalTwd === 'number'
    && Number.isFinite(value.totalTwd)
    && typeof value.createdAt === 'string';
}

function isOrdersEnvelope(value: unknown): value is { ok: true; data: OrderProjection[] } {
  return isRecord(value)
    && value.ok === true
    && Array.isArray(value.data)
    && value.data.every(isOrderProjection);
}

function formatDateTime(value: string | null): string {
  if (!value) return '尚未排定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatStatus(value: string): string {
  const labels: Record<string, string> = {
    draft: '草稿',
    confirmed: '已確認',
    cancelled: '已取消',
    pending_payment: '待付款',
    paid: '已付款',
    unpaid: '未付款',
  };
  return labels[value] ?? value;
}

export default function Midao2OrdersPage() {
  const [state, setState] = useState<PageState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/api/v2/guide/bookings', { cache: 'no-store' });
      if (response.status === 401) {
        window.location.assign('/guide/login?next=/midao2/orders');
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isOrdersEnvelope(payload)) throw new Error('MIDAO2_ORDERS_LOAD_FAILED');
      setState({ kind: 'ready', orders: payload.data });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-label="訂單" aria-labelledby="midao2-orders-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Icon name="file-text" size={24} style={{ color: C.ACCENT }} />
        <div>
          <h1 id="midao2-orders-title" style={{ fontSize: 24, margin: 0 }}>訂單</h1>
          <p style={{ color: C.MUTED, fontSize: 14, margin: '4px 0 0' }}>查看行程預約與付款進度</p>
        </div>
      </div>

      {state.kind === 'loading' && (
        <Card data-testid="midao2-orders-loading">
          <Spinner />
        </Card>
      )}

      {state.kind === 'error' && (
        <Card>
          <div role="alert">
            <ErrorState text="目前無法載入訂單，請稍後再試。" onRetry={() => void load()} />
          </div>
        </Card>
      )}

      {state.kind === 'ready' && state.orders.length === 0 && (
        <Card data-testid="midao2-orders-empty">
          <EmptyState text="目前還沒有訂單" />
        </Card>
      )}

      {state.kind === 'ready' && state.orders.length > 0 && (
        <div data-testid="midao2-orders-list" aria-live="polite" style={{ display: 'grid', gap: 12 }}>
          {state.orders.map((order) => (
            <Card key={order.id}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12 }}>
                <strong style={{ fontSize: 16 }}>{order.tourTitle || '未命名行程'}</strong>
                <span style={{ color: C.ACCENT, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {formatStatus(order.status)}
                </span>
              </div>
              <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', margin: '16px 0 0' }}>
                <div><dt style={{ color: C.MUTED, fontSize: 12 }}>出發時間</dt><dd style={{ margin: '4px 0 0' }}>{formatDateTime(order.scheduleDate)}</dd></div>
                <div><dt style={{ color: C.MUTED, fontSize: 12 }}>人數</dt><dd style={{ margin: '4px 0 0' }}>{order.partySize} 人</dd></div>
                <div><dt style={{ color: C.MUTED, fontSize: 12 }}>付款</dt><dd style={{ margin: '4px 0 0' }}>{formatStatus(order.paymentStatus)}</dd></div>
                <div><dt style={{ color: C.MUTED, fontSize: 12 }}>訂單金額</dt><dd style={{ margin: '4px 0 0' }}>NT$ {order.totalTwd.toLocaleString('zh-TW')}</dd></div>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

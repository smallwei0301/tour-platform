'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { InlineError } from '../ui/InlineError';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import styles from './orders.module.css';

interface OrderProjection {
  id: string;
  tourTitle: string;
  scheduleDate: string | null;
  partySize: number;
  status: string;
  paymentStatus: string;
  totalTwd: number;
  createdAt: string;
}

type OrderState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; items: OrderProjection[] };

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

function isSuccessEnvelope(value: unknown): value is { ok: true; data: unknown } {
  return isRecord(value) && value.ok === true && Object.hasOwn(value, 'data');
}

function isOrderList(value: unknown): value is OrderProjection[] {
  return Array.isArray(value) && value.every(isOrderProjection);
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

export function OrderListScreen() {
  const [state, setState] = useState<OrderState>({ kind: 'loading' });
  const mountedRef = useRef(true);
  const requestSequenceRef = useRef(0);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setState({ kind: 'loading' });

    try {
      const response = await fetch('/api/v2/guide/bookings', { cache: 'no-store' });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isSuccessEnvelope(payload) || !isOrderList(payload.data)) {
        throw new Error('MIDAO_ORDERS_LOAD_FAILED');
      }
      if (mountedRef.current && requestSequence === requestSequenceRef.current) {
        setState({ kind: 'ready', items: payload.data });
      }
    } catch {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) {
        setState({ kind: 'error' });
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void load();
  }, [load]);

  return (
    <section className={styles.screen} aria-labelledby="midao-orders-title">
      <div className={styles.intro}>
        <p className="midao-home-eyebrow">預約與付款進度</p>
        <h2 id="midao-orders-title" className="midao-heading">訂單</h2>
        <p className={styles.description}>只顯示屬於你的預約與訂單進度；待處理需求請至「需求」。</p>
      </div>

      {state.kind === 'loading' ? <LoadingSkeleton label="訂單清單載入中" /> : null}
      {state.kind === 'error' ? <InlineError message="目前無法載入訂單" onRetry={() => void load()} /> : null}
      {state.kind === 'ready' && state.items.length === 0 ? (
        <p className={styles.empty} data-testid="midao-orders-empty">目前還沒有訂單</p>
      ) : null}
      {state.kind === 'ready' && state.items.length > 0 ? (
        <div className={styles.list} data-testid="midao-orders-list" aria-live="polite">
          {state.items.map((item) => (
            <article className={styles.card} key={item.id}>
              <div className={styles.cardTopline}>
                <strong className={styles.title}>{item.tourTitle || '未命名行程'}</strong>
                <span className={styles.status}>{formatStatus(item.status)}</span>
              </div>
              <dl className={styles.meta}>
                <div><dt>出發時間</dt><dd>{formatDateTime(item.scheduleDate)}</dd></div>
                <div><dt>人數</dt><dd>{item.partySize} 人</dd></div>
                <div><dt>付款</dt><dd>{formatStatus(item.paymentStatus)}</dd></div>
                <div><dt>訂單金額</dt><dd>NT$ {item.totalTwd.toLocaleString('zh-TW')}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

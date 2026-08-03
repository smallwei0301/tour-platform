'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { InlineError } from '../ui/InlineError';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { RequestCard } from './RequestCard';

export const REQUEST_BUCKETS = [
  { value: 'all', label: '全部' },
  { value: 'new', label: '待確認' },
  { value: 'needs_reply', label: '待回覆' },
  { value: 'replied', label: '已回覆' },
  { value: 'completed', label: '已完成' },
] as const;

export type RequestBucket = typeof REQUEST_BUCKETS[number]['value'];
export type RequestSort = 'priority' | 'updated_desc' | 'service_asc';

export interface RequestListItem {
  kind: 'booking';
  requestRef: string;
  bookingId: string;
  bookingNo: string | null;
  bookingStatus: string;
  guideApprovalStatus: string;
  orderStatus: string;
  bucket: string;
  secondaryState: string | null;
  needsReply: boolean;
  traveler: { displayName: string | null; emailMasked: string | null };
  service: {
    activityId: string;
    activityPlanId: string;
    title: string | null;
    planName: string | null;
    bookingType: 'request';
  };
  request: {
    startAt: string;
    endAt: string;
    timezone: string;
    partySize: number | null;
  };
  totalTwd: number | null;
  paymentDeadlineAt: string | null;
  receivedAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

interface RequestListData {
  items: RequestListItem[];
  nextCursor: string | null;
}

type RequestState = {
  items: RequestListItem[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
};

type LoadArgs = {
  bucket: RequestBucket;
  sort: RequestSort;
  cursor: string | null;
  append: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isPartySize(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1);
}

function isRequestListItem(value: unknown): value is RequestListItem {
  if (!isRecord(value)
    || value.kind !== 'booking'
    || typeof value.requestRef !== 'string'
    || value.requestRef.length === 0
    || typeof value.bookingId !== 'string'
    || !isStringOrNull(value.bookingNo)
    || typeof value.bookingStatus !== 'string'
    || typeof value.guideApprovalStatus !== 'string'
    || typeof value.orderStatus !== 'string'
    || typeof value.bucket !== 'string'
    || !isStringOrNull(value.secondaryState)
    || typeof value.needsReply !== 'boolean'
    || !isRecord(value.traveler)
    || !isStringOrNull(value.traveler.displayName)
    || !isStringOrNull(value.traveler.emailMasked)
    || !isRecord(value.service)
    || typeof value.service.activityId !== 'string'
    || typeof value.service.activityPlanId !== 'string'
    || !isStringOrNull(value.service.title)
    || !isStringOrNull(value.service.planName)
    || value.service.bookingType !== 'request'
    || !isRecord(value.request)
    || typeof value.request.startAt !== 'string'
    || typeof value.request.endAt !== 'string'
    || typeof value.request.timezone !== 'string'
    || !isPartySize(value.request.partySize)
    || (value.totalTwd !== null && typeof value.totalTwd !== 'number')
    || !isStringOrNull(value.paymentDeadlineAt)
    || typeof value.receivedAt !== 'string'
    || typeof value.updatedAt !== 'string'
    || !isStringOrNull(value.lastMessageAt)) return false;
  return true;
}

function isListData(value: unknown): value is RequestListData {
  return isRecord(value)
    && Array.isArray(value.items)
    && value.items.every(isRequestListItem)
    && (value.nextCursor === null || typeof value.nextCursor === 'string');
}

function isSuccessEnvelope(value: unknown): value is { success: true; data: unknown } {
  return isRecord(value) && value.success === true && Object.hasOwn(value, 'data');
}

function parseBucket(value: string | null): RequestBucket {
  return REQUEST_BUCKETS.some((bucket) => bucket.value === value)
    ? value as RequestBucket
    : 'all';
}

function parseSort(value: string | null): RequestSort {
  return value === 'updated_desc' || value === 'service_asc' ? value : 'priority';
}

export function RequestListScreen() {
  const searchParams = useSearchParams();
  const urlBucket = parseBucket(searchParams.get('bucket'));
  const urlSort = parseSort(searchParams.get('sort'));
  const [bucket, setBucket] = useState<RequestBucket>(urlBucket);
  const [sort] = useState<RequestSort>(urlSort);
  const [state, setState] = useState<RequestState>({
    items: [],
    nextCursor: null,
    loading: true,
    loadingMore: false,
    error: false,
  });
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lastLoadRef = useRef<LoadArgs>({ bucket: urlBucket, sort: urlSort, cursor: null, append: false });

  const load = useCallback(async (args: LoadArgs) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    lastLoadRef.current = args;
    setState((current) => ({
      ...current,
      loading: !args.append,
      loadingMore: args.append,
      error: false,
    }));

    const params = new URLSearchParams({ bucket: args.bucket, sort: args.sort, limit: '20' });
    if (args.cursor) params.set('cursor', args.cursor);

    try {
      const response = await fetch(`/api/v2/guide/requests?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isSuccessEnvelope(payload) || !isListData(payload.data)) {
        throw new Error('MIDAO_REQUEST_LIST_LOAD_FAILED');
      }
      const data = payload.data;
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;
      setState((current) => ({
        items: args.append ? [...current.items, ...data.items] : data.items,
        nextCursor: data.nextCursor,
        loading: false,
        loadingMore: false,
        error: false,
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;
      setState((current) => ({ ...current, loading: false, loadingMore: false, error: true }));
    }
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void load({ bucket: urlBucket, sort: urlSort, cursor: null, append: false });
  }, [load, urlBucket, urlSort]);

  const selectBucket = (nextBucket: RequestBucket) => {
    if (nextBucket === bucket) return;
    setBucket(nextBucket);
    setState({ items: [], nextCursor: null, loading: true, loadingMore: false, error: false });
    window.history.replaceState(null, '', nextBucket === 'all' ? '/midao/requests' : `/midao/requests?bucket=${nextBucket}`);
    void load({ bucket: nextBucket, sort, cursor: null, append: false });
  };

  const retry = () => void load(lastLoadRef.current);
  const loadMore = () => {
    if (!state.nextCursor || state.loadingMore) return;
    void load({ bucket, sort, cursor: state.nextCursor, append: true });
  };

  if (state.loading && state.items.length === 0) {
    return (
      <section className="midao-request-screen" aria-labelledby="midao-request-title">
        <h2 id="midao-request-title" className="midao-heading">需求</h2>
        <LoadingSkeleton label="需求清單載入中" />
      </section>
    );
  }

  return (
    <section className="midao-request-screen" aria-labelledby="midao-request-title">
      <div className="midao-request-screen__intro">
        <div>
          <p className="midao-home-eyebrow">旅人的預約需求</p>
          <h2 id="midao-request-title" className="midao-heading">需求</h2>
          <p className="midao-request-screen__description">只顯示屬於你的需求，開啟卡片查看完整內容。</p>
        </div>
      </div>

      <div className="midao-request-tabs" role="tablist" aria-label="需求分頁">
        {REQUEST_BUCKETS.map((tab) => (
          <button
            key={tab.value}
            className="midao-request-tab"
            id={`midao-request-tab-${tab.value}`}
            role="tab"
            type="button"
            aria-selected={bucket === tab.value}
            aria-controls="midao-request-panel"
            onClick={() => selectBucket(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="midao-request-panel"
        id="midao-request-panel"
        role="tabpanel"
        aria-labelledby={`midao-request-tab-${bucket}`}
        aria-live="polite"
      >
        {state.error ? (
          <InlineError message="目前無法載入需求清單" onRetry={retry} />
        ) : null}
        {!state.error && state.items.length === 0 ? (
          <p className="midao-request-empty" data-testid="midao-request-empty">這個分頁目前沒有需求</p>
        ) : null}
        {state.items.length > 0 ? (
          <div className="midao-request-list" data-testid="midao-request-list">
            {state.items.map((item) => <RequestCard key={item.requestRef} request={item} />)}
          </div>
        ) : null}
        {state.loadingMore ? <LoadingSkeleton label="下一頁需求載入中" /> : null}
        {!state.error && state.nextCursor && !state.loadingMore ? (
          <button className="midao-request-load-more" type="button" onClick={loadMore}>
            載入更多需求
          </button>
        ) : null}
      </div>
    </section>
  );
}

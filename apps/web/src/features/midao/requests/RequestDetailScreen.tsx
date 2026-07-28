'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { InlineError } from '../ui/InlineError';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { RequestSummaryCard } from './RequestSummaryCard';

export interface RequestDetail {
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
  traveler: {
    displayName: string | null;
    emailMasked: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
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
    customerNote: string | null;
  };
  totalTwd: number | null;
  paymentDeadlineAt: string | null;
  receivedAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  status: {
    bookingStatus: string;
    guideApprovalStatus: string;
    orderStatus: string;
    guideApprovalDecidedAt: string | null;
    guideApprovalNote: string | null;
  };
  allowedActions: {
    approve: boolean;
    reject: boolean;
    markReplied: boolean;
    convertInquiry: boolean;
  };
}

type DetailState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: RequestDetail };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isDetailData(value: unknown): value is RequestDetail {
  if (!isRecord(value)
    || value.kind !== 'booking'
    || typeof value.requestRef !== 'string'
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
    || !isStringOrNull(value.traveler.contactEmail)
    || !isStringOrNull(value.traveler.contactPhone)
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
    || (value.request.partySize !== null
      && (!Number.isInteger(value.request.partySize) || (value.request.partySize as number) < 1))
    || !isStringOrNull(value.request.customerNote)
    || (value.totalTwd !== null && typeof value.totalTwd !== 'number')
    || !isStringOrNull(value.paymentDeadlineAt)
    || typeof value.receivedAt !== 'string'
    || typeof value.updatedAt !== 'string'
    || !isStringOrNull(value.lastMessageAt)
    || !isRecord(value.status)
    || typeof value.status.bookingStatus !== 'string'
    || typeof value.status.guideApprovalStatus !== 'string'
    || typeof value.status.orderStatus !== 'string'
    || !isStringOrNull(value.status.guideApprovalDecidedAt)
    || !isStringOrNull(value.status.guideApprovalNote)
    || !isRecord(value.allowedActions)
    || typeof value.allowedActions.approve !== 'boolean'
    || typeof value.allowedActions.reject !== 'boolean'
    || typeof value.allowedActions.markReplied !== 'boolean'
    || typeof value.allowedActions.convertInquiry !== 'boolean') {
    return false;
  }
  return true;
}

function isSuccessEnvelope(value: unknown): value is { success: true; data: unknown } {
  return isRecord(value) && value.success === true && Object.hasOwn(value, 'data');
}

export function RequestDetailScreen({ requestRef }: { requestRef: string }) {
  const [state, setState] = useState<DetailState>({ kind: 'loading' });
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setState({ kind: 'loading' });

    try {
      const response = await fetch(`/api/v2/guide/requests/${encodeURIComponent(requestRef)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isSuccessEnvelope(payload) || !isDetailData(payload.data)) {
        throw new Error('MIDAO_REQUEST_DETAIL_LOAD_FAILED');
      }
      if (mountedRef.current && requestSequence === requestSequenceRef.current) {
        setState({ kind: 'ready', data: payload.data });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (mountedRef.current && requestSequence === requestSequenceRef.current) {
        setState({ kind: 'error' });
      }
    }
  }, [requestRef]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void load();
  }, [load]);

  return (
    <section className="midao-request-detail-screen" aria-labelledby="midao-request-detail-title">
      <Link className="midao-request-detail-back" href="/midao/requests">
        <span aria-hidden="true">←</span>返回需求列表
      </Link>
      <div className="midao-request-detail-intro">
        <p className="midao-home-eyebrow">需求內容</p>
        <h2 id="midao-request-detail-title" className="midao-heading">需求詳情</h2>
        <p className="midao-request-screen__description">確認旅程內容與旅人留下的聯絡資訊。</p>
      </div>

      {state.kind === 'loading' ? <LoadingSkeleton label="需求詳情載入中" /> : null}
      {state.kind === 'error' ? (
        <InlineError message="目前無法載入需求詳情" onRetry={() => void load()} />
      ) : null}
      {state.kind === 'ready' ? <DetailContent detail={state.data} /> : null}
    </section>
  );
}

function DetailContent({ detail }: { detail: RequestDetail }) {
  const isPendingDecision = detail.allowedActions.approve || detail.allowedActions.reject;
  return (
    <div className="midao-request-detail-content">
      <RequestSummaryCard detail={detail} />
      <section className="midao-request-detail-status" aria-labelledby="midao-request-status-title">
        <div>
          <p className="midao-home-eyebrow">處理狀態</p>
          <h3 id="midao-request-status-title" className="midao-heading">{statusLabel(detail)}</h3>
        </div>
        {isPendingDecision ? (
          <p className="midao-request-detail-status__note">目前僅顯示待確認狀態</p>
        ) : null}
      </section>
    </div>
  );
}

function statusLabel(detail: RequestDetail): string {
  if (detail.allowedActions.approve || detail.allowedActions.reject) return '等待導遊確認';
  if (detail.needsReply) return '等待回覆';
  if (detail.bucket === 'completed') return '已完成';
  if (detail.bucket === 'replied') return '已回覆';
  return '處理中';
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { InlineError } from '../ui/InlineError';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { InquiryConversionSheet, type InquiryPlanSummary } from './InquiryConversionSheet';
import { RequestProgressActions } from './RequestProgressActions';
import { RequestSummaryCard } from './RequestSummaryCard';
import { TravelerContactActions } from './TravelerContactActions';

export interface BookingRequestDetail {
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

export interface InquiryRequestDetail {
  kind: 'inquiry';
  requestRef: string;
  inquiryId: string;
  inquiryNo: string;
  inquiryStatus: string;
  bucket: string;
  secondaryState: string | null;
  needsReply: boolean;
  traveler: {
    displayName: null;
    emailMasked: null;
  };
  service: {
    activityId: string;
    activityPlanId: string | null;
    title: string | null;
    planName: string | null;
    bookingType: 'request' | null;
  };
  request: {
    preferredDate: string | null;
    backupDate: string | null;
    startTimeLocal: string | null;
    partySize: number | null;
    language: string | null;
    pickupRequired: boolean | null;
    travelerNote: string | null;
  };
  plan: InquiryPlanSummary | null;
  convertedBookingId: string | null;
  lastRepliedAt: string | null;
  expiresAt: string | null;
  receivedAt: string;
  updatedAt: string;
  allowedActions: {
    approve: boolean;
    reject: boolean;
    markReplied: boolean;
    convertInquiry: boolean;
  };
}

export type RequestDetail = BookingRequestDetail | InquiryRequestDetail;

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

function isBookingDetailData(value: unknown): value is BookingRequestDetail {
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

function isPlanSummary(value: unknown): value is InquiryPlanSummary | null {
  if (value === null) return true;
  return isRecord(value)
    && typeof value.activityPlanId === 'string'
    && isStringOrNull(value.name)
    && typeof value.bookingType === 'string'
    && typeof value.status === 'string'
    && Number.isInteger(value.minParticipants)
    && Number.isInteger(value.maxParticipants)
    && typeof value.basePrice === 'number';
}

function isInquiryDetailData(value: unknown): value is InquiryRequestDetail {
  if (!isRecord(value)
    || value.kind !== 'inquiry'
    || typeof value.requestRef !== 'string'
    || typeof value.inquiryId !== 'string'
    || typeof value.inquiryNo !== 'string'
    || typeof value.inquiryStatus !== 'string'
    || typeof value.bucket !== 'string'
    || !isStringOrNull(value.secondaryState)
    || typeof value.needsReply !== 'boolean'
    || !isRecord(value.traveler)
    || value.traveler.displayName !== null
    || value.traveler.emailMasked !== null
    || !isRecord(value.service)
    || typeof value.service.activityId !== 'string'
    || !isStringOrNull(value.service.activityPlanId)
    || !isStringOrNull(value.service.title)
    || !isStringOrNull(value.service.planName)
    || (value.service.bookingType !== 'request' && value.service.bookingType !== null)
    || !isRecord(value.request)
    || !isStringOrNull(value.request.preferredDate)
    || !isStringOrNull(value.request.backupDate)
    || !isStringOrNull(value.request.startTimeLocal)
    || (value.request.partySize !== null
      && (!Number.isInteger(value.request.partySize) || (value.request.partySize as number) < 1))
    || !isStringOrNull(value.request.language)
    || (value.request.pickupRequired !== null && typeof value.request.pickupRequired !== 'boolean')
    || !isStringOrNull(value.request.travelerNote)
    || !isPlanSummary(value.plan)
    || !isStringOrNull(value.convertedBookingId)
    || !isStringOrNull(value.lastRepliedAt)
    || !isStringOrNull(value.expiresAt)
    || typeof value.receivedAt !== 'string'
    || typeof value.updatedAt !== 'string'
    || !isRecord(value.allowedActions)
    || typeof value.allowedActions.approve !== 'boolean'
    || typeof value.allowedActions.reject !== 'boolean'
    || typeof value.allowedActions.markReplied !== 'boolean'
    || typeof value.allowedActions.convertInquiry !== 'boolean') {
    return false;
  }
  return true;
}

function isDetailData(value: unknown): value is RequestDetail {
  return isBookingDetailData(value) || isInquiryDetailData(value);
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
      {state.kind === 'ready' ? <DetailContent detail={state.data} onReload={load} /> : null}
    </section>
  );
}

function DetailContent({ detail, onReload }: { detail: RequestDetail; onReload: () => Promise<void> }) {
  if (detail.kind === 'inquiry') {
    return <InquiryDetailContent detail={detail} onReload={onReload} />;
  }
  const isPendingDecision = detail.allowedActions.approve || detail.allowedActions.reject;
  return (
    <div className="midao-request-detail-content">
      <RequestSummaryCard detail={detail} />
      <section className="midao-request-detail-status" aria-labelledby="midao-request-status-title">
        <div>
          <p className="midao-home-eyebrow">處理狀態</p>
          <h3 id="midao-request-status-title" className="midao-heading">{statusLabel(detail)}</h3>
        </div>
        {isPendingDecision ? <RequestProgressActions bookingId={detail.bookingId} allowedActions={detail.allowedActions} onReload={onReload} /> : null}
      </section>
    </div>
  );
}

function InquiryDetailContent({
  detail,
  onReload,
}: {
  detail: InquiryRequestDetail;
  onReload: () => Promise<void>;
}) {
  return (
    <div className="midao-request-detail-content" data-testid="midao-inquiry-detail">
      <RequestSummaryCard detail={detail} />
      <section className="midao-request-detail-status" aria-labelledby="midao-request-status-title">
        <div>
          <p className="midao-home-eyebrow">處理狀態</p>
          <h3 id="midao-request-status-title" className="midao-heading">{statusLabel(detail)}</h3>
        </div>
      </section>
      <TravelerContactActions
        requestRef={detail.requestRef}
        inquiryId={detail.inquiryId}
        canMarkReplied={detail.allowedActions.markReplied}
        onReload={onReload}
      />
      {detail.allowedActions.convertInquiry || detail.plan === null ? (
        <InquiryConversionSheet
          inquiryId={detail.inquiryId}
          plan={detail.plan}
          defaultParticipants={detail.request.partySize}
          preferredDate={detail.request.preferredDate}
          startTimeLocal={detail.request.startTimeLocal}
          onConverted={() => { /* 結果由 sheet 自行呈現，避免覆蓋確認連結。 */ }}
          onReload={onReload}
        />
      ) : null}
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

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { InlineError } from '../ui/InlineError';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { PriorityRequestCard } from './PriorityRequestCard';
import { RecentProgressList } from './RecentProgressList';
import { RequestCounterCards } from './RequestCounterCards';

export interface HomePriorityRequest {
  requestRef: string;
  travelerDisplayName: string | null;
  serviceTitle: string | null;
  startAt: string;
  partySize: number | null;
  receivedAt: string;
  paymentDeadlineAt: string | null;
  needsReply: boolean;
}

export interface HomeRecentProgress {
  requestRef: string;
  serviceTitle: string | null;
  bucket: string;
  secondaryState: string | null;
  updatedAt: string;
}

export interface HomeData {
  profile: { displayName: string };
  counters: {
    pendingBookingRequests: number;
    messageThreadsNeedingReply: number;
  };
  priorityRequests: HomePriorityRequest[];
  recentProgress: HomeRecentProgress[];
  messages: { latestNeedsReplyAt: string | null };
}

type HomeState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: HomeData };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPartySize(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1);
}

function isHomeData(value: unknown): value is HomeData {
  if (!isRecord(value) || !isRecord(value.profile) || typeof value.profile.displayName !== 'string') return false;
  if (!isRecord(value.counters)
    || !isNonNegativeInteger(value.counters.pendingBookingRequests)
    || !isNonNegativeInteger(value.counters.messageThreadsNeedingReply)) return false;
  if (!Array.isArray(value.priorityRequests) || !Array.isArray(value.recentProgress)) return false;
  if (!value.priorityRequests.every((request) => (
    isRecord(request)
    && typeof request.requestRef === 'string'
    && isStringOrNull(request.travelerDisplayName)
    && isStringOrNull(request.serviceTitle)
    && typeof request.startAt === 'string'
    && isPartySize(request.partySize)
    && typeof request.receivedAt === 'string'
    && isStringOrNull(request.paymentDeadlineAt)
    && typeof request.needsReply === 'boolean'
  ))) return false;
  if (!value.recentProgress.every((progress) => (
    isRecord(progress)
    && typeof progress.requestRef === 'string'
    && isStringOrNull(progress.serviceTitle)
    && typeof progress.bucket === 'string'
    && isStringOrNull(progress.secondaryState)
    && typeof progress.updatedAt === 'string'
  ))) return false;
  return isRecord(value.messages) && isStringOrNull(value.messages.latestNeedsReplyAt);
}

function isSuccessEnvelope(value: unknown): value is { success: true; data: unknown } {
  return isRecord(value) && value.success === true && Object.hasOwn(value, 'data');
}

export function HomeScreen() {
  const [state, setState] = useState<HomeState>({ kind: 'loading' });
  const mountedRef = useRef(true);
  const requestSequenceRef = useRef(0);
  const didLoadRef = useRef(false);

  const load = useCallback(async () => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setState({ kind: 'loading' });

    try {
      const response = await fetch('/api/v2/guide/home', { cache: 'no-store' });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isSuccessEnvelope(payload) || !isHomeData(payload.data)) {
        throw new Error('MIDAO_HOME_LOAD_FAILED');
      }
      if (mountedRef.current && requestSequence === requestSequenceRef.current) {
        setState({ kind: 'ready', data: payload.data });
      }
    } catch {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) {
        setState({ kind: 'error' });
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void load();
  }, [load]);

  if (state.kind === 'loading') {
    return <LoadingSkeleton label="祕島首頁載入中" />;
  }

  if (state.kind === 'error') {
    return <InlineError message="目前無法載入導遊首頁" onRetry={() => void load()} />;
  }

  const { data } = state;
  return (
    <section className="midao-home-screen" aria-labelledby="midao-home-title">
      <div className="midao-home-intro">
        <div>
          <p className="midao-home-eyebrow">今日營運概況</p>
          <h2 id="midao-home-title" className="midao-heading">首頁</h2>
          <p className="midao-home-welcome">歡迎回來，{data.profile.displayName}</p>
        </div>
        {data.messages.latestNeedsReplyAt ? (
          <p className="midao-home-last-message">
            最近待回覆：{formatDateTime(data.messages.latestNeedsReplyAt)}
          </p>
        ) : null}
      </div>

      <RequestCounterCards counters={data.counters} />

      <div className="midao-home-section-grid">
        <section className="midao-home-section" aria-labelledby="midao-home-priority-title">
          <div className="midao-home-section__header">
            <div>
              <p className="midao-home-eyebrow">先處理這些</p>
              <h3 id="midao-home-priority-title" className="midao-heading">優先需求</h3>
            </div>
            <span className="midao-home-section__limit">最多 3 筆</span>
          </div>
          {data.priorityRequests.length > 0 ? (
            <div className="midao-home-priority-list" data-testid="midao-home-priority-list">
              {data.priorityRequests.slice(0, 3).map((request) => (
                <PriorityRequestCard key={request.requestRef} request={request} />
              ))}
            </div>
          ) : (
            <p className="midao-home-empty" data-testid="midao-home-priority-empty">目前沒有待處理需求</p>
          )}
        </section>

        <RecentProgressList items={data.recentProgress.slice(0, 3)} />
      </div>
    </section>
  );
}

function formatDateTime(value: string): string {
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

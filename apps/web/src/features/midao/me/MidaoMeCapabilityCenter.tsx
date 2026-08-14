'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { InlineError } from '../ui/InlineError';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';

type CapabilityData = {
  displayName: string;
  serviceTotal: number;
  pendingBookingRequests: number;
  messageThreadsNeedingReply: number;
};

type CapabilityState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: CapabilityData };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseHome(value: unknown): Omit<CapabilityData, 'serviceTotal'> | null {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) return null;
  const { profile, counters } = value.data;
  if (!isRecord(profile) || typeof profile.displayName !== 'string') return null;
  if (!isRecord(counters)
    || !isNonNegativeInteger(counters.pendingBookingRequests)
    || !isNonNegativeInteger(counters.messageThreadsNeedingReply)) return null;
  return {
    displayName: profile.displayName,
    pendingBookingRequests: counters.pendingBookingRequests,
    messageThreadsNeedingReply: counters.messageThreadsNeedingReply,
  };
}

function parseServices(value: unknown): number | null {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) return null;
  return isNonNegativeInteger(value.data.total) ? value.data.total : null;
}

export function MidaoMeCapabilityCenter() {
  const [state, setState] = useState<CapabilityState>({ kind: 'loading' });
  const mountedRef = useRef(true);
  const requestSequenceRef = useRef(0);
  const didLoadRef = useRef(false);

  const load = useCallback(async () => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setState({ kind: 'loading' });
    try {
      const [homeResponse, servicesResponse] = await Promise.all([
        fetch('/api/v2/guide/home', { cache: 'no-store' }),
        fetch('/api/v2/guide/services?page=1&pageSize=1&status=all', { cache: 'no-store' }),
      ]);
      const [homePayload, servicesPayload]: unknown[] = await Promise.all([
        homeResponse.json().catch(() => null),
        servicesResponse.json().catch(() => null),
      ]);
      const home = homeResponse.ok ? parseHome(homePayload) : null;
      const serviceTotal = servicesResponse.ok ? parseServices(servicesPayload) : null;
      if (home === null || serviceTotal === null) throw new Error('MIDAO_ME_CAPABILITY_LOAD_FAILED');
      if (mountedRef.current && requestSequence === requestSequenceRef.current) {
        setState({ kind: 'ready', data: { ...home, serviceTotal } });
      }
    } catch {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void load();
  }, [load]);

  if (state.kind === 'loading') return <LoadingSkeleton label="能力中心載入中" />;
  if (state.kind === 'error') return <InlineError message="目前無法載入能力中心" onRetry={() => void load()} />;

  const { data } = state;
  return (
    <section className="midao-me-capabilities" aria-label="能力中心">
      <h3>能力中心</h3>
      <div className="midao-me-card-grid">
        <a className="midao-me-card midao-me-card--action" href="/midao/services">
          <span className="midao-me-card__eyebrow">原生祕島</span>
          <h4>服務管理</h4>
          <p>管理你名下的服務與方案。</p>
          <strong className="midao-me-card__summary">{data.serviceTotal} 項服務</strong>
        </a>
        <a className="midao-me-card midao-me-card--action" href="/midao/requests">
          <span className="midao-me-card__eyebrow">原生祕島</span>
          <h4>預約與需求</h4>
          <p>查看等待你確認與回覆的旅客需求。</p>
          <strong className="midao-me-card__summary">待確認 {data.pendingBookingRequests}・待回覆 {data.messageThreadsNeedingReply}</strong>
        </a>
        <a className="midao-me-card midao-me-card--action" href="/midao/legacy/public-profile?returnTo=%2Fmidao%2Fme">
          <span className="midao-me-card__eyebrow">公開資料</span>
          <h4>公開頁面與通知</h4>
          <p>調整公開資料、刊登狀態與通知綁定。</p>
          <strong className="midao-me-card__summary">{data.displayName}</strong>
        </a>
      </div>
    </section>
  );
}

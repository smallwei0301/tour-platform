'use client';

// midao2 需求詳情：頭部聯絡資訊 → 行程需求卡 → 特殊需求提示 → 複製摘要 → 進度 radio → 複製 LINE 回覆。

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { C, Card, Badge, Btn, Spinner, ErrorState, copyToClipboard, apiGet, apiSend, Icon } from '../../ui';
import {
  buildRequestSummaryText,
  buildLineReplyText,
  periodLabel,
} from '../../../../../src/lib/midao/midao-copy-templates.mjs';

type MidaoAnswer = { label: string; answer: string };

type MidaoRequestDetail = {
  id: string;
  requestNo: string;
  travelerName: string;
  travelerLineId: string | null;
  travelerEmail: string | null;
  activityTitle: string | null;
  planTitle: string | null;
  preferredDate: string;
  backupDate: string | null;
  preferredPeriod: string | null;
  startTime: string | null;
  endTime: string | null;
  participantsCount: number;
  participantsNote: string | null;
  language: string | null;
  needPickup: boolean;
  specialNote: string | null;
  answers: MidaoAnswer[];
  status: string;
  createdAt: string;
};

const STATUS_OPTIONS: { key: string; label: string; testId: string }[] = [
  { key: 'replied', label: '確認中', testId: 'midao2-status-replied' },
  { key: 'closed_won', label: '已成交', testId: 'midao2-status-closed_won' },
  { key: 'closed_done', label: '結束案件', testId: 'midao2-status-closed_done' },
];

function readGuideNameCookie(): string {
  if (typeof document === 'undefined') return '導遊';
  const match = document.cookie.match(/(?:^|; )guide_name=([^;]*)/);
  if (!match) return '導遊';
  try {
    return decodeURIComponent(match[1]) || '導遊';
  } catch {
    return '導遊';
  }
}

export default function Midao2RequestDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = (params?.id as string) || '';

  const [request, setRequest] = useState<MidaoRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guideName] = useState<string>(() => readGuideNameCookie());
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedReply, setCopiedReply] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // copy 回饋 setTimeout 卸載時清乾淨，避免 unmount 後 setState 警告。
  useEffect(() => {
    return () => {
      if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet(`/api/v2/guide/midao/requests/${id}`)
      .then((d) => {
        if (cancelled) return;
        const found = d?.request as MidaoRequestDetail;
        setRequest(found);
        // 載入後若仍是「新需求」→ 自動轉待回覆（成功以回傳更新 state；失敗靜默不擋閱讀）。
        if (found?.status === 'new') {
          apiSend(`/api/v2/guide/midao/requests/${id}`, 'PATCH', { status: 'pending_reply' })
            .then((r2) => {
              if (!cancelled && r2?.request) setRequest(r2.request);
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || '載入失敗');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleCopySummary = async () => {
    if (!request) return;
    const ok = await copyToClipboard(buildRequestSummaryText(request));
    if (ok) {
      setCopiedSummary(true);
      if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
      summaryTimerRef.current = setTimeout(() => setCopiedSummary(false), 2000);
    }
  };

  const handleCopyReply = async () => {
    if (!request) return;
    const ok = await copyToClipboard(buildLineReplyText(request, guideName));
    if (!ok) return;
    setCopiedReply(true);
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    replyTimerRef.current = setTimeout(() => setCopiedReply(false), 2000);
    // 複製回覆＝進入確認中：僅當目前仍是待回覆時才自動轉態。
    if (request.status === 'pending_reply') {
      apiSend(`/api/v2/guide/midao/requests/${id}`, 'PATCH', { status: 'replied' })
        .then((r2) => {
          if (r2?.request) setRequest(r2.request);
        })
        .catch(() => {});
    }
  };

  const handleStatusClick = async (key: string) => {
    if (!request || statusSaving) return;
    if (key === request.status) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      const r2 = await apiSend(`/api/v2/guide/midao/requests/${id}`, 'PATCH', { status: key });
      if (r2?.request) setRequest(r2.request);
    } catch (err: any) {
      setStatusError(err?.message || '更新失敗');
    } finally {
      setStatusSaving(false);
    }
  };

  if (loading) return <Spinner />;
  if (error || !request) return <ErrorState text={error || '載入失敗'} onRetry={() => router.refresh()} />;

  const lineId = request.travelerLineId;
  const email = request.travelerEmail;

  let dateLine = `${request.preferredDate}`;
  if (request.backupDate) dateLine += `（備用 ${request.backupDate}）`;
  if (request.preferredPeriod) dateLine += `・${periodLabel(request.preferredPeriod)}`;
  if (request.startTime) dateLine += ` ${request.startTime}–${request.endTime ?? ''}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 32px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="返回"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.TEXT, padding: 0, display: 'flex' }}
        >
          <Icon name="back" size={20} />
        </button>
        <h1 style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, margin: 0 }}>需求詳情</h1>
        <div />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Badge status={request.status} />
          <span style={{ fontSize: 13, color: C.MUTED, fontFamily: 'monospace' }}>#{request.requestNo}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{request.travelerName}</div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {lineId && (
              <button
                type="button"
                data-testid="midao2-detail-line"
                onClick={() => {
                  window.open(`https://line.me/R/ti/p/~${encodeURIComponent(lineId)}`);
                  copyToClipboard(lineId);
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: 'none',
                  background: '#06C755',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Icon name="line" size={20} style={{ color: '#ffffff' }} />
              </button>
            )}
            {email && (
              <a
                data-testid="midao2-detail-mail"
                href={`mailto:${encodeURIComponent(email)}`}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: `1px solid ${C.ACCENT}`,
                  color: C.ACCENT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                }}
              >
                <Icon name="email" size={18} />
              </a>
            )}
          </div>
        </div>
      </div>

      <Card>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icon name="itinerary" size={18} style={{ color: C.ACCENT }} />
          行程需求
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
          {request.activityTitle && (
            <div>
              <span style={{ color: C.MUTED }}>服務：</span>
              {request.planTitle ? `${request.activityTitle}（${request.planTitle}）` : request.activityTitle}
            </div>
          )}
          <div>
            <span style={{ color: C.MUTED }}>日期：</span>
            {dateLine}
          </div>
          <div>
            <span style={{ color: C.MUTED }}>人數：</span>
            {request.participantsCount} 位
            {request.participantsNote ? `・${request.participantsNote}` : ''}
          </div>
          {request.language && (
            <div>
              <span style={{ color: C.MUTED }}>語言：</span>
              {request.language}
            </div>
          )}
          <div>
            <span style={{ color: C.MUTED }}>接送：</span>
            {request.needPickup ? '需要' : '不需要'}
          </div>
          {request.answers.map((a, i) => (
            <div key={i}>
              <span style={{ color: C.MUTED }}>{a.label}：</span>
              {a.answer}
            </div>
          ))}
        </div>
      </Card>

      {request.specialNote && (
        <Card style={{ background: C.ORANGE_SOFT, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="walking" size={18} />
          <div style={{ fontSize: 14, color: C.TEXT }}>{request.specialNote}</div>
        </Card>
      )}

      <Btn kind="secondary" onClick={handleCopySummary} data-testid="midao2-detail-copy-summary">
        {copiedSummary ? (
          '已複製 ✓'
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="copy" size={16} />
            複製需求摘要
          </span>
        )}
      </Btn>

      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>更新進度</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {STATUS_OPTIONS.map((opt) => {
            const selected = request.status === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                data-testid={opt.testId}
                onClick={() => handleStatusClick(opt.key)}
                disabled={statusSaving}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  borderRadius: 999,
                  border: selected ? `1px solid ${C.ACCENT}` : `1px solid ${C.BORDER}`,
                  background: selected ? C.ACCENT_SOFT : C.CARD,
                  color: selected ? C.ACCENT : C.TEXT,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: statusSaving ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                {selected && <Icon name="check-circle" size={16} />}
                {opt.label}
              </button>
            );
          })}
        </div>
        {statusError && <div style={{ color: C.RED, fontSize: 13, marginTop: 8 }}>{statusError}</div>}
      </div>

      <Btn kind="primary" onClick={handleCopyReply} data-testid="midao2-detail-copy-reply">
        {copiedReply ? (
          '已複製 ✓'
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="copy" size={16} />
            複製 LINE 回覆
          </span>
        )}
      </Btn>
    </div>
  );
}

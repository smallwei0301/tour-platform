'use client';

// midao2 首頁：問候語 → 統計卡 → 需要你處理 → 最近進度 → 分享接案頁 CTA。

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { C, Card, Badge, Btn, Spinner, EmptyState, ErrorState, copyToClipboard, apiGet } from './ui';
import { buildLineReplyText } from '../../../src/lib/midao-copy-templates.mjs';

type MidaoRequest = {
  id: string;
  requestNo: string;
  travelerName: string;
  activityTitle: string | null;
  preferredDate: string;
  participantsCount: number;
  language: string | null;
  status: string;
  createdAt: string;
};

type Summary = {
  guideName: string;
  counts: { newRequests: number; pendingReply: number };
  topRequest: MidaoRequest | null;
  recentRequests: MidaoRequest[];
};

function greetingWord(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return '早安';
  if (hour >= 11 && hour < 18) return '午安';
  return '晚安';
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${Math.max(diffMin, 0)} 分鐘前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小時前`;
  return new Date(iso).toLocaleDateString('zh-TW');
}

export default function Midao2HomePage() {
  const router = useRouter();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet('/api/v2/guide/midao/summary')
      .then((d) => setData(d))
      .catch((err) => setError(err?.message || '載入失敗'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState text={error || '載入失敗'} onRetry={load} />;

  const { guideName, counts, topRequest, recentRequests } = data;

  const handleCopy = async () => {
    if (!topRequest) return;
    const ok = await copyToClipboard(buildLineReplyText(topRequest, guideName));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.ACCENT, marginBottom: 4 }}>今日接案</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          {greetingWord()}，{guideName}
        </h1>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <Card
          style={{ flex: 1, background: C.ACCENT_SOFT }}
          onClick={() => router.push('/midao2/requests?status=new')}
          data-testid="midao2-stat-new"
        >
          <div style={{ fontSize: 22, marginBottom: 4 }}>📄</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{counts.newRequests}</div>
          <div style={{ fontSize: 13, color: C.MUTED }}>筆新需求</div>
        </Card>
        <Card
          style={{ flex: 1, background: C.ORANGE_SOFT }}
          onClick={() => router.push('/midao2/requests?status=pending_reply')}
          data-testid="midao2-stat-pending"
        >
          <div style={{ fontSize: 22, marginBottom: 4 }}>💬</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{counts.pendingReply}</div>
          <div style={{ fontSize: 13, color: C.MUTED }}>筆待回覆</div>
        </Card>
      </div>

      {topRequest && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>需要你處理</h2>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{topRequest.travelerName}</div>
              <Badge status={topRequest.status} />
            </div>
            {topRequest.activityTitle && (
              <div style={{ fontSize: 14, color: C.TEXT, marginTop: 4 }}>{topRequest.activityTitle}</div>
            )}
            <div style={{ fontSize: 13, color: C.MUTED, marginTop: 8 }}>
              📅 {topRequest.preferredDate}・👤 {topRequest.participantsCount} 人・🌐 {topRequest.language ?? '—'}
            </div>
            <div style={{ fontSize: 12, color: C.MUTED, marginTop: 4 }}>{relativeTime(topRequest.createdAt)} 收到</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <Btn
                kind="primary"
                onClick={() => router.push(`/midao2/requests/${topRequest.id}`)}
                data-testid="midao2-top-view"
              >
                查看需求
              </Btn>
              <Btn kind="secondary" onClick={handleCopy} data-testid="midao2-top-copy">
                {copied ? '已複製 ✓' : '複製回覆'}
              </Btn>
            </div>
          </Card>
        </div>
      )}

      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>最近進度</h2>
        <Card style={{ padding: recentRequests.length ? 0 : 16 }}>
          {recentRequests.length === 0 ? (
            <EmptyState text="目前沒有進行中的需求" />
          ) : (
            recentRequests.map((r, index) => (
              <div
                key={r.id}
                onClick={() => router.push(`/midao2/requests/${r.id}`)}
                data-testid={`midao2-recent-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  borderBottom: index < recentRequests.length - 1 ? `1px solid ${C.BORDER}` : undefined,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: C.ACCENT_SOFT,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  👤
                </div>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{r.travelerName}</div>
                <Badge status={r.status} />
                <span style={{ color: C.MUTED }}>›</span>
              </div>
            ))
          )}
        </Card>
      </div>

      <Card
        style={{ background: C.ORANGE_SOFT, display: 'flex', alignItems: 'center', gap: 12 }}
        onClick={() => router.push('/midao2/me')}
        data-testid="midao2-share-cta"
      >
        <div style={{ fontSize: 22 }}>📤</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>分享接案頁</div>
          <div style={{ fontSize: 13, color: C.MUTED }}>讓旅客直接送出需求</div>
        </div>
        <span style={{ color: C.MUTED }}>›</span>
      </Card>
    </div>
  );
}

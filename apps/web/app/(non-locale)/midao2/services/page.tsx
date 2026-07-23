'use client';

// midao2 服務列表：已上架/草稿分頁 ＋ 服務卡（封面/狀態/時長人數/價格/成交方式）＋ 新增/編輯導轉。

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { C, Card, Btn, Spinner, EmptyState, ErrorState, apiGet, Icon } from '../ui';

type MidaoService = {
  activityId: string;
  title: string;
  tagline: string | null;
  coverImageUrl: string | null;
  durationMinutes: number | null;
  minParticipants: number;
  maxParticipants: number;
  region: string | null;
  languages: string[];
  priceTwd: number;
  dealMode: 'instant_booking' | 'confirm_first' | 'line_inquiry';
  questions: unknown[];
  showcasePublished: boolean;
  mainSiteStatus: string;
  midaoSortOrder: number | null;
};

type TabKey = 'published' | 'draft';

const DEAL_MODE_LABEL: Record<string, string> = {
  instant_booking: '可直接預約',
  confirm_first: '先確認日期與需求',
  line_inquiry: '直接使用 LINE 詢問',
};

function formatHours(durationMinutes: number | null): string {
  if (!durationMinutes) return '—';
  const hours = durationMinutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function Midao2ServicesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>('published');
  const [items, setItems] = useState<MidaoService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCoverError, setShowCoverError] = useState(searchParams.get('coverError') === '1');

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet('/api/v2/guide/midao/services')
      .then((d) => setItems(Array.isArray(d?.items) ? d.items : []))
      .catch((err) => setError(err?.message || '載入失敗'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = items.filter((it) => (tab === 'published' ? it.showcasePublished : !it.showcasePublished));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>我的服務</h1>
        <Btn kind="primary" onClick={() => router.push('/midao2/services/new')} data-testid="midao2-svc-new">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={16} />
            新增服務
          </span>
        </Btn>
      </div>

      {showCoverError && (
        <div
          data-testid="midao2-svc-cover-error"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: C.ORANGE_SOFT,
            color: C.ORANGE,
            borderRadius: 12,
            padding: '10px 14px',
            fontSize: 13,
          }}
        >
          <span>服務已建立，但封面上傳失敗——請進編輯頁重新上傳封面。</span>
          <button
            type="button"
            onClick={() => setShowCoverError(false)}
            aria-label="關閉提示"
            style={{ background: 'transparent', border: 'none', color: C.ORANGE, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, borderBottom: `1px solid ${C.BORDER}` }}>
        {(['published', 'draft'] as TabKey[]).map((key) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              data-testid={`midao2-svc-tab-${key}`}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: active ? `2px solid ${C.ACCENT}` : '2px solid transparent',
                color: active ? C.ACCENT : C.MUTED,
                fontWeight: active ? 700 : 500,
                fontSize: 14,
                padding: '8px 2px',
                cursor: 'pointer',
              }}
            >
              {key === 'published' ? '已上架' : '草稿'}
            </button>
          );
        })}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState text={error} onRetry={load} />
      ) : (
        <>
          <div style={{ fontSize: 13, color: C.MUTED }}>{filtered.length} 項服務</div>
          {filtered.length === 0 ? (
            <Card>
              <EmptyState text="這個分類目前沒有服務" />
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map((svc) => (
                <Card key={svc.activityId} style={{ display: 'flex', gap: 12 }}>
                  <div
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 12,
                      background: C.BG,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {svc.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={svc.coverImageUrl} alt={svc.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Icon name="image-upload" size={28} style={{ color: C.MUTED }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: svc.showcasePublished ? C.GREEN : C.MUTED }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: svc.showcasePublished ? C.GREEN : C.MUTED }} />
                          {svc.showcasePublished ? '已上架' : '草稿'}
                        </span>
                        {svc.mainSiteStatus === 'published' && (
                          <span style={{ fontSize: 12, color: C.MUTED }}>祕島已上架</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push(`/midao2/services/${svc.activityId}/edit`)}
                        data-testid={`midao2-svc-edit-${svc.activityId}`}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}
                        aria-label="編輯服務"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{svc.title}</div>
                    <div style={{ fontSize: 13, color: C.MUTED }}>
                      約 {formatHours(svc.durationMinutes)} 小時 ・ {svc.minParticipants}-{svc.maxParticipants} 人
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: C.GREEN }}>
                        NT${svc.priceTwd.toLocaleString()} 起
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: C.MUTED }}>{DEAL_MODE_LABEL[svc.dealMode] || svc.dealMode}</div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Midao2ServicesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Midao2ServicesPageInner />
    </Suspense>
  );
}

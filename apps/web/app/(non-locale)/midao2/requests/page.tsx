'use client';

// midao2 需求列表：狀態分頁（全部/新需求/待回覆/已回覆/已完成）＋排序＋需求卡。

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { C, Card, Badge, Spinner, EmptyState, ErrorState, apiGet, Icon } from '../ui';

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

type TabCounts = { new: number; pendingReply: number; replied: number; closed: number };

type StatusKey = 'all' | 'new' | 'pending_reply' | 'replied' | 'closed';
type SortKey = 'unreplied_first' | 'newest';

const VALID_STATUSES: StatusKey[] = ['all', 'new', 'pending_reply', 'replied', 'closed'];

const TABS: { key: StatusKey; label: string; countKey?: keyof TabCounts }[] = [
  { key: 'all', label: '全部' },
  { key: 'new', label: '新需求', countKey: 'new' },
  { key: 'pending_reply', label: '待回覆', countKey: 'pendingReply' },
  { key: 'replied', label: '已回覆', countKey: 'replied' },
  { key: 'closed', label: '已完成', countKey: 'closed' },
];

function RequestsListPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawStatus = searchParams.get('status');
  const initialStatus: StatusKey = VALID_STATUSES.includes(rawStatus as StatusKey) ? (rawStatus as StatusKey) : 'all';

  const [status, setStatus] = useState<StatusKey>(initialStatus);
  const [sort, setSort] = useState<SortKey>('unreplied_first');
  const [items, setItems] = useState<MidaoRequest[]>([]);
  const [tabCounts, setTabCounts] = useState<TabCounts>({ new: 0, pendingReply: 0, replied: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (s: StatusKey, sortValue: SortKey) => {
    setLoading(true);
    setError(null);
    apiGet(`/api/v2/guide/midao/requests?status=${s}&sort=${sortValue}`)
      .then((d) => {
        setItems(d?.items || []);
        setTabCounts(d?.tabCounts || { new: 0, pendingReply: 0, replied: 0, closed: 0 });
      })
      .catch((err) => setError(err?.message || '載入失敗'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(status, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabClick = (s: StatusKey) => {
    setStatus(s);
    router.replace(`/midao2/requests?status=${s}`);
    load(s, sort);
  };

  const handleSortChange = (s: SortKey) => {
    setSort(s);
    load(status, s);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>旅客需求</h1>

      <div
        style={{
          display: 'flex',
          gap: 20,
          overflowX: 'auto',
          borderBottom: `1px solid ${C.BORDER}`,
        }}
      >
        {TABS.map((tab) => {
          const count = tab.countKey ? tabCounts[tab.countKey] : undefined;
          const active = status === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabClick(tab.key)}
              data-testid={`midao2-reqtab-${tab.key}`}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: active ? `2px solid ${C.ACCENT}` : '2px solid transparent',
                color: active ? C.ACCENT : C.MUTED,
                fontWeight: active ? 700 : 500,
                fontSize: 14,
                padding: '8px 2px',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {tab.label}
              {typeof count === 'number' && count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value as SortKey)}
          data-testid="midao2-req-sort"
          style={{
            border: `1px solid ${C.BORDER}`,
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 13,
            color: C.TEXT,
            background: C.CARD,
          }}
        >
          <option value="unreplied_first">未回覆優先</option>
          <option value="newest">最新優先</option>
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState text={error} onRetry={() => load(status, sort)} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState text="這個分類目前沒有需求" />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => (
            <Card
              key={item.id}
              onClick={() => router.push(`/midao2/requests/${item.id}`)}
              data-testid={`midao2-req-card-${item.requestNo}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{item.travelerName}</span>
                    <Badge status={item.status} />
                  </div>
                  {item.activityTitle && (
                    <div style={{ fontSize: 14, color: C.TEXT, marginTop: 4 }}>{item.activityTitle}</div>
                  )}
                  <div style={{ fontSize: 14, color: C.MUTED, marginTop: 8 }}>
                    {item.preferredDate} ・ {item.participantsCount} 人 ・ {item.language ?? '—'}
                  </div>
                </div>
                <span style={{ color: C.MUTED, display: 'flex' }}>
                  <Icon name="chevron-right" size={18} />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Midao2RequestsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RequestsListPageInner />
    </Suspense>
  );
}

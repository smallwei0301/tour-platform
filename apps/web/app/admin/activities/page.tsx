'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, PageHeader, Badge, TableWrapper, Th, Td, LoadingSkeleton, EmptyState } from '../../../src/components/admin/ui';

type Activity = {
  id: string;
  slug: string;
  title: string;
  region?: string;
  category?: string;
  priceTwd: number;
  status: string;
  publishedAt?: string;
  createdAt?: string;
  guideName?: string;
  guideSlug?: string;
  scheduleCount?: number;
};

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已發佈' },
  { value: 'archived', label: '已封存' },
];

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  draft:     { variant: 'warning', label: '草稿' },
  published: { variant: 'success', label: '已發佈' },
  archived:  { variant: 'default', label: '已封存' },
};

export default function AdminActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await fetch(`/api/admin/activities${q}`, { cache: 'no-store' });
      const json = await res.json();
      setActivities(json.data || []);
    } catch { setActivities([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function handleStatusChange(id: string, newStatus: string) {
    setBusy(id);
    try {
      await fetch(`/api/admin/activities/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      await load();
    } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader
        title="行程管理"
        subtitle={`共 ${activities.length} 個行程`}
        actions={
          <Link
            href="/admin/activities/new"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--tp-primary, #16a34a)', color: '#fff',
              padding: '10px 20px', borderRadius: 8, fontWeight: 700,
              textDecoration: 'none', fontSize: 14,
            }}
          >
            ＋ 新增行程
          </Link>
        }
      />

      <div style={{ padding: '20px 28px' }}>
        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #f0f0f0', paddingBottom: 0 }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              style={{
                padding: '10px 18px', border: 'none', background: 'none',
                fontWeight: statusFilter === tab.value ? 700 : 400,
                fontSize: 14, cursor: 'pointer',
                borderBottom: statusFilter === tab.value ? '2px solid var(--tp-primary, #16a34a)' : '2px solid transparent',
                color: statusFilter === tab.value ? 'var(--tp-primary, #16a34a)' : '#666',
                marginBottom: -2,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Card>
          {loading ? (
            <LoadingSkeleton />
          ) : activities.length === 0 ? (
            <EmptyState message={statusFilter ? `沒有${STATUS_BADGE[statusFilter]?.label || ''}行程` : '尚無行程'} />
          ) : (
            <TableWrapper>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th>行程名稱</Th>
                    <Th>導遊</Th>
                    <Th>地區</Th>
                    <Th>類別</Th>
                    <Th>價格</Th>
                    <Th>場次</Th>
                    <Th>狀態</Th>
                    <Th>操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((a) => {
                    const badge = STATUS_BADGE[a.status] || { variant: 'default' as const, label: a.status };
                    return (
                      <tr key={a.id}>
                        <Td>
                          <Link href={`/admin/activities/${a.id}/edit`} style={{ color: 'var(--tp-primary, #16a34a)', fontWeight: 600, textDecoration: 'none' }}>
                            {a.title?.length > 30 ? a.title.slice(0, 30) + '…' : a.title}
                          </Link>
                        </Td>
                        <Td>{a.guideName || a.guideSlug || '—'}</Td>
                        <Td>{a.region || '—'}</Td>
                        <Td>{a.category || '—'}</Td>
                        <Td>NT${a.priceTwd?.toLocaleString()}</Td>
                        <Td>{a.scheduleCount ?? 0}</Td>
                        <Td><Badge variant={badge.variant}>{badge.label}</Badge></Td>
                        <Td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Link
                              href={`/admin/activities/${a.id}/edit`}
                              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#f0f0f0', textDecoration: 'none', color: '#333' }}
                            >
                              編輯
                            </Link>
                            {a.status === 'draft' && (
                              <button
                                onClick={() => handleStatusChange(a.id, 'published')}
                                disabled={busy === a.id}
                                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#dcfce7', color: '#166534', border: 'none', cursor: 'pointer' }}
                              >
                                發佈
                              </button>
                            )}
                            {a.status === 'published' && (
                              <button
                                onClick={() => handleStatusChange(a.id, 'archived')}
                                disabled={busy === a.id}
                                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#fee2e2', color: '#991b1b', border: 'none', cursor: 'pointer' }}
                              >
                                下架
                              </button>
                            )}
                            {a.status === 'archived' && (
                              <button
                                onClick={() => handleStatusChange(a.id, 'draft')}
                                disabled={busy === a.id}
                                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#dbeafe', color: '#1e40af', border: 'none', cursor: 'pointer' }}
                              >
                                重新編輯
                              </button>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </Card>
      </div>
    </>
  );
}

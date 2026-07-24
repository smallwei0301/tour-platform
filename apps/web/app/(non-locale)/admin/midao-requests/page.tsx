'use client';

// 管理員跨導遊需求單視圖（唯讀，Plan3 Task5）：GET /api/v2/admin/midao/requests?status=

import { useEffect, useState } from 'react';
import { Card, PageHeader, Badge, Select, EmptyState } from '../../../../src/components/admin/ui';

type MidaoRequestRow = {
  id: string;
  requestNo: string;
  travelerName: string;
  guideName: string;
  activityTitle: string | null;
  planTitle: string | null;
  preferredDate: string;
  participantsCount: number;
  status: string;
  createdAt: string;
};

// 篩選白名單／中文標籤：對映 db-midao-requests.mjs 的 TAB_FILTERS keys。
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'new', label: '新需求' },
  { value: 'pending_reply', label: '待回覆' },
  { value: 'replied', label: '已回覆' },
  { value: 'closed', label: '已完成' },
];

// 個別需求單狀態章（與 midao2 STATUS_META 中文標籤一致，色彩以 admin Badge variant 簡化）。
const ROW_STATUS_META: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'default' | 'orange' }> = {
  new: { label: '新需求', variant: 'info' },
  pending_reply: { label: '待回覆', variant: 'orange' },
  replied: { label: '已回覆', variant: 'success' },
  closed_won: { label: '已成交', variant: 'success' },
  closed_done: { label: '已完成', variant: 'default' },
};

function RowStatusBadge({ status }: { status: string }) {
  const meta = ROW_STATUS_META[status] || { label: status, variant: 'default' as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export default function AdminMidaoRequestsPage() {
  const [status, setStatus] = useState('all');
  const [items, setItems] = useState<MidaoRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(s: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v2/admin/midao/requests?status=${encodeURIComponent(s)}`, { cache: 'no-store' });
      const json = await res.json();
      if (json?.success) {
        setItems(json.data?.items || []);
      } else {
        setError(json?.error?.message || '載入失敗');
      }
    } catch {
      setError('載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(status); }, [status]);

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="midao2 需求單" subtitle="跨導遊唯讀彙整，用於客服協查與整體量能掌握" />

      <div className="admin-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card className="admin-toolbar" style={{ padding: '14px 18px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>篩選狀態</span>
          <Select value={status} onChange={setStatus} style={{ minWidth: 160 }}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <span className="admin-toolbar-meta" style={{ fontSize: 13, color: '#9ca3af' }}>共 {items.length} 筆</span>
        </Card>

        {error && (
          <Card style={{ padding: '14px 18px', color: '#dc2626', fontSize: 13 }}>⚠️ {error}</Card>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>
        ) : items.length === 0 ? (
          <Card><EmptyState message="沒有符合條件的需求單" /></Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
            {items.map((r) => (
              <Card key={r.id} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace' }}>#{r.requestNo}</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#111', marginTop: 2 }}>{r.travelerName}</div>
                  </div>
                  <RowStatusBadge status={r.status} />
                </div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>🧭 {r.guideName}</div>
                {r.activityTitle && (
                  <div style={{ fontSize: 13, color: '#374151' }}>
                    {r.activityTitle}{r.planTitle ? `（${r.planTitle}）` : ''}
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#9ca3af', borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                  🗓️ {r.preferredDate} ・ {r.participantsCount} 人
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

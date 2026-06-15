'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, Badge } from '../../../src/components/admin/ui';
import { ResponsiveTable, type ResponsiveColumn } from '../../../src/components/admin/responsive';
import { csrfHeaders } from '../../../src/lib/csrf-client';
import { useTablistKeyboard } from '../../../src/lib/use-tablist-keyboard';

const REVIEW_STATUS_TABS = [
  { value: 'pending', label: '待審核' },
  { value: 'approved', label: '已核准' },
  { value: 'rejected', label: '已拒絕' },
  { value: '', label: '全部' },
] as const;
const REVIEW_STATUS_VALUES = REVIEW_STATUS_TABS.map((t) => t.value);

type Review = {
  id: string;
  author: string;
  activity_slug: string;
  rating: number;
  review_text: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  booking_id: string;
  photo_urls?: string[];
};

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const tabKb = useTablistKeyboard(REVIEW_STATUS_VALUES, statusFilter, setStatusFilter);

  async function load(status: string) {
    setLoading(true);
    setError('');
    try {
      const url = status ? `/api/admin/reviews?status=${encodeURIComponent(status)}` : '/api/admin/reviews';
      const res = await fetch(url, { cache: 'no-store' });
      if (res.status === 401) {
        setError('未授權，請重新登入');
        return;
      }
      const json = await res.json();
      setReviews(json.data || []);
    } catch {
      setError('載入失敗，請重試');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(statusFilter); }, [statusFilter]);

  async function handleAction(id: string, newStatus: 'approved' | 'rejected') {
    const label = newStatus === 'approved' ? '核准' : '拒絕';
    if (!confirm(`確定要${label}此評價？`)) return;
    setActionLoading(id + newStatus);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await load(statusFilter);
      } else {
        const json = await res.json();
        alert(`${label}失敗：` + (json.error?.message || '未知錯誤'));
      }
    } catch {
      alert('網路錯誤，請重試');
    } finally {
      setActionLoading(null);
    }
  }

  function truncate(text: string, max = 60) {
    if (!text) return '—';
    return text.length > max ? text.slice(0, max) + '…' : text;
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function renderStars(rating: number) {
    return '★'.repeat(Math.max(0, Math.min(5, rating))) + '☆'.repeat(Math.max(0, 5 - rating));
  }

  const pendingCount = reviews.filter(r => r.status === 'pending').length;

  const reviewColumns: ResponsiveColumn<Review>[] = [
    {
      key: 'author', header: '作者 (author)', mobilePriority: 'title',
      cell: (r) => <span style={{ fontSize: 13 }}>{r.author || '—'}</span>,
    },
    {
      key: 'status', header: '狀態 (status)', mobilePriority: 'subtitle',
      cell: (r) => (
        <Badge
          variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}
        >
          {r.status === 'approved' ? '已核准' : r.status === 'rejected' ? '已拒絕' : '待審核'}
        </Badge>
      ),
    },
    {
      key: 'activity', header: '行程', mobileLabel: '行程',
      cell: (r) => <span style={{ fontSize: 12, wordBreak: 'break-all' }}>{r.activity_slug || '—'}</span>,
      tdStyle: { maxWidth: 160, wordBreak: 'break-all' },
    },
    {
      key: 'rating', header: '評分 (rating)', mobileLabel: '評分',
      cell: (r) => <span style={{ fontSize: 15, letterSpacing: 1, color: '#f59e0b' }}>{renderStars(r.rating)}</span>,
    },
    {
      key: 'text', header: '評價內容', mobileLabel: '內容',
      cell: (r) => <span style={{ fontSize: 12, color: '#374151' }}>{truncate(r.review_text)}</span>,
      tdStyle: { maxWidth: 200 },
    },
    {
      key: 'photos', header: '照片', mobileLabel: '照片',
      cell: (r) => (
        Array.isArray(r.photo_urls) && r.photo_urls.length > 0 ? (
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', maxWidth: 180 }}>
            {r.photo_urls.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer" style={{ flex: '0 0 auto', lineHeight: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`照片 ${i + 1}`} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, border: '1px solid #e5e7eb' }} />
              </a>
            ))}
          </div>
        ) : <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
      ),
      tdStyle: { maxWidth: 200 },
    },
    {
      key: 'created', header: '建立時間', mobileLabel: '建立',
      cell: (r) => <span style={{ fontSize: 12 }}>{formatDate(r.created_at)}</span>,
    },
    {
      key: 'actions', header: '操作', mobileLabel: '操作',
      cell: (r) => (
        r.status === 'pending' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => void handleAction(r.id, 'approved')}
              disabled={actionLoading === r.id + 'approved'}
              style={{
                fontSize: 12, color: '#10b981', background: 'none', border: '1px solid #10b981',
                borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600,
              }}
            >
              {actionLoading === r.id + 'approved' ? '處理中...' : '核准'}
            </button>
            <button
              onClick={() => void handleAction(r.id, 'rejected')}
              disabled={actionLoading === r.id + 'rejected'}
              style={{
                fontSize: 12, color: '#dc2626', background: 'none', border: '1px solid #dc2626',
                borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600,
              }}
            >
              {actionLoading === r.id + 'rejected' ? '處理中...' : '拒絕'}
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
        )
      ),
    },
  ];

  return (
    <div className="admin-page" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="評價管理"
        subtitle="審核旅客提交的行程評價，核准或拒絕後更新行程評分"
        actions={
          pendingCount > 0 && statusFilter === 'pending' ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 999,
              background: '#fef3c7', color: '#92400e',
              fontWeight: 700, fontSize: 13,
            }}>
              待審核 {pendingCount} 筆
            </span>
          ) : undefined
        }
      />

      {/* Status filter tabs */}
      <div role="tablist" aria-label="評價狀態篩選" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {REVIEW_STATUS_TABS.map((tab, i) => (
          <button
            key={tab.value}
            ref={tabKb.registerTab(i)}
            role="tab"
            aria-selected={statusFilter === tab.value}
            onClick={() => setStatusFilter(tab.value)}
            onKeyDown={tabKb.onKeyDown}
            style={{
              padding: '7px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: statusFilter === tab.value ? 'var(--tp-primary)' : '#fff',
              color: statusFilter === tab.value ? '#fff' : '#374151',
              fontWeight: statusFilter === tab.value ? 700 : 500,
              fontSize: 13, cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#dc2626' }}>
          {error}
        </div>
      )}

      <Card>
        <ResponsiveTable
          columns={reviewColumns}
          rows={reviews}
          getRowKey={(r) => r.id}
          loading={loading}
          loadingRows={4}
          emptyMessage={`目前沒有${statusFilter === 'pending' ? '待審核' : statusFilter === 'approved' ? '已核准' : statusFilter === 'rejected' ? '已拒絕' : ''}的評價。`}
        />
      </Card>
    </div>
  );
}

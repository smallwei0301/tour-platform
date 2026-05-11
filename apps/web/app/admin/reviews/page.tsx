'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, Badge, TableWrapper, Th, Td, LoadingSkeleton, EmptyState } from '../../../src/components/admin/ui';

type Review = {
  id: string;
  author: string;
  activity_slug: string;
  rating: number;
  review_text: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  booking_id: string;
};

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');

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
        headers: { 'content-type': 'application/json' },
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

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { value: 'pending', label: '待審核' },
          { value: 'approved', label: '已核准' },
          { value: 'rejected', label: '已拒絕' },
          { value: '', label: '全部' },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
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
        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : reviews.length === 0 ? (
          <EmptyState message={`目前沒有${statusFilter === 'pending' ? '待審核' : statusFilter === 'approved' ? '已核准' : statusFilter === 'rejected' ? '已拒絕' : ''}的評價。`} />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>作者 (author)</Th>
                <Th>行程</Th>
                <Th>評分 (rating)</Th>
                <Th>評價內容</Th>
                <Th>狀態 (status)</Th>
                <Th>建立時間</Th>
                <Th>操作</Th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <Td style={{ fontSize: 13 }}>{r.author || '—'}</Td>
                  <Td style={{ fontSize: 12, maxWidth: 160, wordBreak: 'break-all' }}>{r.activity_slug || '—'}</Td>
                  <Td style={{ fontSize: 15, letterSpacing: 1, color: '#f59e0b' }}>{renderStars(r.rating)}</Td>
                  <Td style={{ fontSize: 12, maxWidth: 200, color: '#374151' }}>{truncate(r.review_text)}</Td>
                  <Td>
                    <Badge
                      variant={
                        r.status === 'approved' ? 'success'
                          : r.status === 'rejected' ? 'danger'
                          : 'warning'
                      }
                    >
                      {r.status === 'approved' ? '已核准'
                        : r.status === 'rejected' ? '已拒絕'
                        : '待審核'}
                    </Badge>
                  </Td>
                  <Td style={{ fontSize: 12 }}>{formatDate(r.created_at)}</Td>
                  <Td>
                    {r.status === 'pending' && (
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
                    )}
                    {r.status !== 'pending' && (
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../src/lib/csrf-client';
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
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // ── 直接建立並跳轉 edit ──
  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch('/api/admin/activities', {
        method: 'POST',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ title: '新行程', priceTwd: 0 }),
      });
      const json = await res.json();
      if (json.ok && json.data?.id) {
        router.push(`/admin/activities/${json.data.id}/edit`);
      } else {
        alert('建立失敗：' + (json.error?.message || '未知錯誤'));
        setCreating(false);
      }
    } catch {
      alert('網路錯誤，請重試');
      setCreating(false);
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    setBusy(id);
    try {
      await fetch(`/api/admin/activities/${id}/status`, {
        method: 'PATCH',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: newStatus }),
      });
      await load();
    } finally { setBusy(null); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/activities/${deleteTarget.id}`, { method: 'DELETE', headers: csrfHeaders() });
      const json = await res.json();
      if (json.ok) {
        setDeleteTarget(null);
        await load();
      } else {
        alert('刪除失敗：' + (json.error?.message || '未知錯誤'));
      }
    } catch {
      alert('網路錯誤，請重試');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="行程管理"
        subtitle={`共 ${activities.length} 個行程`}
        actions={
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--tp-primary, #16a34a)', color: '#fff',
              padding: '10px 20px', borderRadius: 8, fontWeight: 700,
              border: 'none', cursor: creating ? 'not-allowed' : 'pointer',
              fontSize: 14, opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? '建立中⋯' : '＋ 新增行程'}
          </button>
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
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <Link
                              href={`/admin/activities/${a.id}/edit`}
                              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#f0f0f0', textDecoration: 'none', color: '#333' }}
                            >
                              編輯
                            </Link>
                            <Link
                              href={`/admin/activities/${a.id}/plans`}
                              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#ecfdf5', textDecoration: 'none', color: '#059669' }}
                            >
                              方案
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
                                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#fef9c3', color: '#854d0e', border: 'none', cursor: 'pointer' }}
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
                            <button
                              onClick={() => setDeleteTarget(a)}
                              disabled={busy === a.id}
                              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#fee2e2', color: '#991b1b', border: 'none', cursor: 'pointer' }}
                            >
                              刪除
                            </button>
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

      {/* ── 刪除確認 Dialog ── */}
      {deleteTarget && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}
            onClick={() => !deleting && setDeleteTarget(null)}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#fff', borderRadius: 12, padding: 28,
            zIndex: 1001, width: 380, maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', color: '#111' }}>
              🗑️ 確認刪除行程
            </h3>
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 8 }}>
              即將刪除：<strong>{deleteTarget.title}</strong>
            </p>
            <p style={{ fontSize: 13, color: '#dc2626', background: '#fee2e2', padding: '10px 14px', borderRadius: 8, marginBottom: 20 }}>
              ⚠️ 此操作不可復原。行程資料及所有已上傳的圖片都將永久刪除。
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: '9px 20px', borderRadius: 8, background: '#dc2626', color: '#fff', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, opacity: deleting ? 0.7 : 1 }}
              >
                {deleting ? '刪除中⋯' : '確認刪除'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

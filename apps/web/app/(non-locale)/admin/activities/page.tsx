'use client';

/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../../src/lib/csrf-client';
import { Card, PageHeader, Badge } from '../../../../src/components/admin/ui';
import { ResponsiveTable, ResponsiveModal, type ResponsiveColumn } from '../../../../src/components/admin/responsive';
import { useTablistKeyboard } from '../../../../src/lib/use-tablist-keyboard';

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
] as const;
const STATUS_TAB_VALUES = STATUS_TABS.map((t) => t.value);

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  draft:     { variant: 'warning', label: '草稿' },
  published: { variant: 'success', label: '已發佈' },
  archived:  { variant: 'default', label: '已封存' },
};

export default function AdminActivitiesPage() {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const tabKb = useTablistKeyboard(STATUS_TAB_VALUES, statusFilter, setStatusFilter);
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

  const activityColumns: ResponsiveColumn<Activity>[] = [
    {
      key: 'title', header: '行程名稱', mobilePriority: 'title',
      cell: (a) => (
        <Link href={`/admin/activities/${a.id}/edit`} style={{ color: 'var(--tp-primary, #16a34a)', fontWeight: 600, textDecoration: 'none' }}>
          {a.title?.length > 30 ? a.title.slice(0, 30) + '…' : a.title}
        </Link>
      ),
    },
    {
      key: 'status', header: '狀態', mobilePriority: 'subtitle',
      cell: (a) => {
        const badge = STATUS_BADGE[a.status] || { variant: 'default' as const, label: a.status };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    { key: 'guide', header: '導遊', mobileLabel: '導遊', cell: (a) => a.guideName || a.guideSlug || '—' },
    { key: 'region', header: '地區', mobileLabel: '地區', cell: (a) => a.region || '—' },
    { key: 'category', header: '類別', mobileLabel: '類別', cell: (a) => a.category || '—' },
    { key: 'price', header: '價格', mobileLabel: '價格', cell: (a) => `NT$${a.priceTwd?.toLocaleString() ?? 0}` },
    { key: 'schedules', header: '場次', mobileLabel: '場次', cell: (a) => String(a.scheduleCount ?? 0) },
    {
      key: 'actions', header: '操作', mobileLabel: '操作',
      cell: (a) => (
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
      ),
    },
  ];

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

      <div className="admin-page">
        {/* Status tabs */}
        <div role="tablist" aria-label="活動狀態篩選" style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #f0f0f0', paddingBottom: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {STATUS_TABS.map((tab, i) => (
            <button
              key={tab.value}
              ref={tabKb.registerTab(i)}
              role="tab"
              aria-selected={statusFilter === tab.value}
              onClick={() => setStatusFilter(tab.value)}
              onKeyDown={tabKb.onKeyDown}
              style={{
                padding: '10px 18px', border: 'none', background: 'none',
                fontWeight: statusFilter === tab.value ? 700 : 400,
                fontSize: 14, cursor: 'pointer',
                borderBottom: statusFilter === tab.value ? '2px solid var(--tp-primary, #16a34a)' : '2px solid transparent',
                color: statusFilter === tab.value ? 'var(--tp-primary, #16a34a)' : '#666',
                marginBottom: -2, flexShrink: 0,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Card>
          <ResponsiveTable
            columns={activityColumns}
            rows={activities}
            getRowKey={(a) => a.id}
            loading={loading}
            emptyMessage={statusFilter ? `沒有${STATUS_BADGE[statusFilter]?.label || ''}行程` : '尚無行程'}
          />
        </Card>
      </div>

      {/* ── 刪除確認 Dialog ── */}
      <ResponsiveModal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        size="sm"
        title="🗑️ 確認刪除行程"
        footer={
          <>
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
          </>
        }
      >
        {deleteTarget && (
          <>
            <p style={{ fontSize: 14, color: '#374151', marginTop: 0, marginBottom: 8 }}>
              即將刪除：<strong>{deleteTarget.title}</strong>
            </p>
            <p style={{ fontSize: 13, color: '#dc2626', background: '#fee2e2', padding: '10px 14px', borderRadius: 8, margin: 0 }}>
              ⚠️ 此操作不可復原。行程資料及所有已上傳的圖片都將永久刪除。
            </p>
          </>
        )}
      </ResponsiveModal>
    </>
  );
}

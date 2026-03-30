'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, StatusBadge, Select, Badge, LoadingSkeleton, EmptyState } from '../../../src/components/admin/ui';

type GuideApp = {
  id: string; fullName: string; email: string; phone: string;
  city: string; status: string; bio: string; createdAt: string; adminNote?: string | null;
};

export default function AdminGuidesPage() {
  const [rows, setRows] = useState<GuideApp[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const q = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`/api/admin/guide-applications${q}`, { cache: 'no-store' });
      const json = await res.json();
      setRows(json?.data || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [status]);

  async function action(id: string, kind: 'approve' | 'reject' | 'suspend') {
    const url = kind === 'suspend'
      ? `/api/admin/guides/${id}/suspend`
      : `/api/admin/guide-applications/${id}/${kind}`;
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adminNote: `admin ${kind}` }) });
    await load();
  }

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="導遊審核" subtitle="審核導遊申請、管理帳號狀態" />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Filter */}
        <Card style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>篩選狀態</span>
          <Select value={status} onChange={setStatus} style={{ minWidth: 160 }}>
            <option value="">全部狀態</option>
            <option value="pending">待審核</option>
            <option value="approved">已通過</option>
            <option value="rejected">已拒絕</option>
            <option value="suspended">已停權</option>
          </Select>
          <span style={{ fontSize: 13, color: '#9ca3af', marginLeft: 'auto' }}>共 {rows.length} 筆</span>
        </Card>

        {/* Grid */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 180, borderRadius: 12, background: 'linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6)' }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Card><EmptyState message="沒有符合條件的導遊申請" /></Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {rows.map(r => (
              <Card key={r.id} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{r.fullName}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>📍 {r.city}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>

                {/* Bio */}
                {r.bio && (
                  <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                    {r.bio}
                  </p>
                )}

                {/* Contact */}
                <div style={{ fontSize: 12, color: '#9ca3af', borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                  <div>✉️ {r.email}</div>
                  <div>📞 {r.phone}</div>
                  <div>🗓️ {r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-TW') : '-'}</div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button onClick={() => action(r.id, 'approve')}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: 'var(--tp-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    ✓ 通過
                  </button>
                  <button onClick={() => action(r.id, 'reject')}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    ✕ 拒絕
                  </button>
                  <button onClick={() => action(r.id, 'suspend')}
                    style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #fed7aa', background: '#fff', color: '#d97706', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    停權
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

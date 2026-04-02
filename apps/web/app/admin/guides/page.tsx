'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, StatusBadge, Select, Badge, LoadingSkeleton, EmptyState } from '../../../src/components/admin/ui';

type GuideApp = {
  id: string; fullName: string; email: string; phone: string;
  city: string; status: string; bio: string; createdAt: string; adminNote?: string | null;
};

type GuideProfile = {
  id: string; display_name: string; slug: string; verification_status: string;
  headline?: string | null; region?: string | null; rating_avg?: number | null;
};

type InviteResult = { inviteUrl: string; expiresAt: string; guideName: string } | null;

export default function AdminGuidesPage() {
  // Applications tab
  const [rows, setRows] = useState<GuideApp[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  // Profiles tab
  const [profiles, setProfiles] = useState<GuideProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  // Shared
  const [tab, setTab] = useState<'applications' | 'profiles'>('applications');
  const [inviteResult, setInviteResult] = useState<InviteResult>(null);
  const [inviteLoading, setInviteLoading] = useState<string | null>(null);

  async function generateInvite(guideId: string) {
    setInviteLoading(guideId);
    try {
      const res = await fetch(`/api/admin/guides/${guideId}/invite`, { method: 'POST' });
      const json = await res.json();
      if (json?.data) setInviteResult(json.data);
      else alert(json?.error?.message || '產生失敗');
    } finally {
      setInviteLoading(null);
    }
  }

  async function loadApplications() {
    setLoading(true);
    try {
      const q = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`/api/admin/guide-applications${q}`, { cache: 'no-store' });
      const json = await res.json();
      setRows(json?.data || []);
    } finally { setLoading(false); }
  }

  async function loadProfiles() {
    setProfilesLoading(true);
    try {
      const res = await fetch('/api/admin/guides/approved', { cache: 'no-store' });
      const json = await res.json();
      setProfiles(json?.data || []);
    } finally { setProfilesLoading(false); }
  }

  useEffect(() => { loadApplications(); }, [status]);
  useEffect(() => { if (tab === 'profiles') loadProfiles(); }, [tab]);

  async function action(id: string, kind: 'approve' | 'reject' | 'suspend') {
    const url = kind === 'suspend'
      ? `/api/admin/guides/${id}/suspend`
      : `/api/admin/guide-applications/${id}/${kind}`;
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adminNote: `admin ${kind}` }) });
    await loadApplications();
  }

  const tabStyle = (t: string) => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
    background: tab === t ? '#7c3aed' : 'transparent',
    color: tab === t ? '#fff' : '#6b7280',
  });

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="導遊管理" subtitle="審核申請、管理已上線導遊帳號" />

      {/* Invite Result Modal */}
      {inviteResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>🔑 登入碼已產生</h3>
            <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 14 }}>
              請將以下連結傳給 <strong>{inviteResult.guideName}</strong>，有效期至{' '}
              {new Date(inviteResult.expiresAt).toLocaleString('zh-TW')}
            </p>
            <div style={{ background: '#f3f4f6', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 12 }}>
              {typeof window !== 'undefined' ? window.location.origin : ''}{inviteResult.inviteUrl}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { navigator.clipboard.writeText((typeof window !== 'undefined' ? window.location.origin : '') + inviteResult.inviteUrl); }}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
              >
                📋 複製連結
              </button>
              <button
                onClick={() => setInviteResult(null)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 14 }}
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Tabs */}
        <Card style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
          <button style={tabStyle('applications')} onClick={() => setTab('applications')}>
            📋 導遊申請
          </button>
          <button style={tabStyle('profiles')} onClick={() => setTab('profiles')}>
            👤 已上線導遊
          </button>
        </Card>

        {/* ── Applications Tab ── */}
        {tab === 'applications' && (
          <>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{r.fullName}</div>
                        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>📍 {r.city}</div>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.bio && (
                      <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                        {r.bio}
                      </p>
                    )}
                    <div style={{ fontSize: 12, color: '#9ca3af', borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                      <div>✉️ {r.email}</div>
                      <div>📞 {r.phone}</div>
                      <div>🗓️ {r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-TW') : '-'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button onClick={() => action(r.id, 'approve')}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: 'var(--tp-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        <span data-guide="guide-approve">✓ 通過</span>
                      </button>
                      <button onClick={() => action(r.id, 'reject')}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        <span data-guide="guide-reject">✕ 拒絕</span>
                      </button>
                      <button onClick={() => action(r.id, 'suspend')}
                        style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #fed7aa', background: '#fff', color: '#d97706', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        停權
                      </button>
                      {r.status === 'approved' && (
                        <button
                          onClick={() => generateInvite(r.id)}
                          disabled={inviteLoading === r.id}
                          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #a855f7', background: '#faf5ff', color: '#7c3aed', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                          {inviteLoading === r.id ? '產生中…' : '🔑 產生登入碼'}
                        </button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Profiles Tab ── */}
        {tab === 'profiles' && (
          <>
            <Card style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                已通過審核、可產生登入碼的導遊（來源：guide_profiles）
              </span>
              <span style={{ fontSize: 13, color: '#9ca3af', marginLeft: 'auto' }}>共 {profiles.length} 位</span>
            </Card>

            {profilesLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ height: 140, borderRadius: 12, background: 'linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6)' }} />
                ))}
              </div>
            ) : profiles.length === 0 ? (
              <Card><EmptyState message="目前沒有已審核的導遊" /></Card>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {profiles.map(p => (
                  <Card key={p.id} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{p.display_name}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>@{p.slug}</div>
                        {p.headline && (
                          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{p.headline}</div>
                        )}
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#d1fae5', color: '#065f46' }}>
                        已審核
                      </span>
                    </div>
                    {p.region && (
                      <div style={{ fontSize: 13, color: '#6b7280' }}>📍 {p.region}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace', background: '#f9fafb', padding: '4px 8px', borderRadius: 6 }}>
                      ID: {p.id}
                    </div>
                    <button
                      onClick={() => generateInvite(p.id)}
                      disabled={inviteLoading === p.id}
                      style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {inviteLoading === p.id ? '產生中…' : '🔑 產生登入碼'}
                    </button>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

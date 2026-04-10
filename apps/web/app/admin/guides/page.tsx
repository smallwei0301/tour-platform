'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, StatusBadge, Select, EmptyState } from '../../../src/components/admin/ui';
import { AvatarUpload } from '../../../src/components/admin/AvatarUpload';

type GuideApp = {
  id: string; fullName: string; email: string; phone: string;
  city: string; status: string; bio: string; createdAt: string; adminNote?: string | null;
};

type GuideProfile = {
  id: string; display_name: string; slug: string; verification_status: string;
  headline?: string | null; region?: string | null; rating_avg?: number | null;
  guide_email?: string | null;
  profile_photo_url?: string | null;
};

type EditState = {
  guideId: string; guideName: string; email: string; password: string;
  confirmPassword: string; loading: boolean; error: string; success: string;
  profilePhotoUrl?: string;
};

type InviteResult = { inviteUrl: string; expiresAt: string; guideName: string } | null;

export default function AdminGuidesPage() {
  const [rows, setRows] = useState<GuideApp[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<GuideProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [tab, setTab] = useState<'applications' | 'profiles'>('applications');
  const [inviteResult, setInviteResult] = useState<InviteResult>(null);
  const [inviteLoading, setInviteLoading] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [suspendLoading, setSuspendLoading] = useState<string | null>(null);

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

  /** Approve / Reject application */
  async function appAction(id: string, kind: 'approve' | 'reject') {
    await fetch(`/api/admin/guide-applications/${id}/${kind}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ adminNote: `admin ${kind}` }),
    });
    await loadApplications();
  }

  /**
   * Promote approved application → create guide_profiles + generate invite token.
   * This fixes the "Guide not found" bug (was passing application ID to invite API).
   */
  async function promoteAndInvite(applicationId: string) {
    setInviteLoading(applicationId);
    try {
      const res = await fetch('/api/admin/guides/promote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });
      const json = await res.json();
      if (json.ok) {
        setInviteResult(json.data);
        await loadApplications();
      } else {
        alert(json?.error?.message || '上線失敗');
      }
    } finally { setInviteLoading(null); }
  }

  /** Generate invite for existing guide_profile */
  async function generateInvite(guideId: string) {
    setInviteLoading(guideId);
    try {
      const res = await fetch(`/api/admin/guides/${guideId}/invite`, { method: 'POST' });
      const json = await res.json();
      if (json?.data) setInviteResult(json.data);
      else alert(json?.error?.message || '產生失敗');
    } finally { setInviteLoading(null); }
  }

  /** Suspend or reactivate a guide_profile */
  async function suspendGuide(guideId: string, suspend: boolean) {
    if (!confirm(suspend ? `確定要停權這位導遊嗎？停權後他們將無法登入。` : `確定要恢復這位導遊的帳號嗎？`)) return;
    setSuspendLoading(guideId);
    try {
      const res = await fetch(`/api/admin/guides/${guideId}/suspend`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suspend }),
      });
      const json = await res.json();
      if (json.ok) {
        await loadProfiles();
      } else {
        alert(json?.error?.message || '操作失敗');
      }
    } finally { setSuspendLoading(null); }
  }

  async function handleEditSave() {
    if (!editState) return;
    if (editState.password && editState.password !== editState.confirmPassword) {
      setEditState(s => s ? { ...s, error: '兩次密碼不一致' } : null); return;
    }
    if (editState.password && editState.password.length < 6) {
      setEditState(s => s ? { ...s, error: '密碼至少 6 個字元' } : null); return;
    }
    if (!editState.email && !editState.password) {
      setEditState(s => s ? { ...s, error: '請填寫 Email 或密碼' } : null); return;
    }
    setEditState(s => s ? { ...s, loading: true, error: '' } : null);
    const body: Record<string, string> = {};
    if (editState.email) body.email = editState.email;
    if (editState.password) body.password = editState.password;
    const res = await fetch(`/api/admin/guides/${editState.guideId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.ok) {
      setEditState(s => s ? { ...s, loading: false, password: '', confirmPassword: '', success: '✅ 已更新成功' } : null);
      loadProfiles();
    } else {
      const msg = json?.error?.code === 'EMAIL_TAKEN' ? '此 Email 已被其他導遊使用' : (json?.error?.message || '更新失敗');
      setEditState(s => s ? { ...s, loading: false, error: msg } : null);
    }
  }

  const tabStyle = (t: string) => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
    background: tab === t ? '#7c3aed' : 'transparent',
    color: tab === t ? '#fff' : '#6b7280',
  });

  const btn = (color: string, bg: string, border = 'none') => ({
    padding: '7px 12px', borderRadius: 8, border, background: bg, color, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  } as React.CSSProperties);

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="導遊管理" subtitle="審核申請、管理已上線導遊帳號" />

      {/* ── Invite Result Modal ── */}
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
                onClick={() => navigator.clipboard.writeText((typeof window !== 'undefined' ? window.location.origin : '') + inviteResult.inviteUrl)}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
              >
                📋 複製連結
              </button>
              <button onClick={() => setInviteResult(null)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 14 }}>
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Guide Account Modal ── */}
      {editState && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>✏️ 編輯導遊帳號</h3>
            <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 13 }}>{editState.guideName}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Avatar Upload */}
              <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
                <AvatarUpload
                  guideId={editState.guideId}
                  currentUrl={editState.profilePhotoUrl}
                  onUpload={(url) => {
                    setEditState(s => s ? { ...s, profilePhotoUrl: url, success: '✅ 頭像已更新' } : null);
                    loadProfiles();
                  }}
                  size={100}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>電子信箱（登入用）</label>
                <input type="email" value={editState.email}
                  onChange={e => setEditState(s => s ? { ...s, email: e.target.value, success: '' } : null)}
                  placeholder="guide@example.com"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>新密碼（留空則不修改）</label>
                <input type="password" value={editState.password}
                  onChange={e => setEditState(s => s ? { ...s, password: e.target.value, success: '' } : null)}
                  placeholder="至少 6 個字元"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14 }} />
              </div>
              {editState.password && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>確認新密碼</label>
                  <input type="password" value={editState.confirmPassword}
                    onChange={e => setEditState(s => s ? { ...s, confirmPassword: e.target.value, success: '' } : null)}
                    placeholder="再輸入一次"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14 }} />
                </div>
              )}
              {editState.error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13 }}>⚠️ {editState.error}</div>}
              {editState.success && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', color: '#16a34a', fontSize: 13 }}>{editState.success}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={handleEditSave} disabled={editState.loading}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: editState.loading ? '#a78bfa' : '#7c3aed', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                  {editState.loading ? '儲存中…' : '💾 儲存'}
                </button>
                <button onClick={() => setEditState(null)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 14 }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Tabs */}
        <Card style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
          <button style={tabStyle('applications')} onClick={() => setTab('applications')}>📋 導遊申請</button>
          <button style={tabStyle('profiles')} onClick={() => setTab('profiles')}>👤 已上線導遊</button>
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
              </Select>
              <span style={{ fontSize: 13, color: '#9ca3af', marginLeft: 'auto' }}>共 {rows.length} 筆</span>
            </Card>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>
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
                      <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as React.CSSProperties['WebkitBoxOrient'] }}>
                        {r.bio}
                      </p>
                    )}
                    <div style={{ fontSize: 12, color: '#9ca3af', borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                      <div>✉️ {r.email}</div>
                      <div>📞 {r.phone}</div>
                      <div>🗓️ {r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-TW') : '-'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {r.status === 'pending' && <>
                        <button onClick={() => appAction(r.id, 'approve')} style={btn('#fff', '#7c3aed')}>✓ 通過</button>
                        <button onClick={() => appAction(r.id, 'reject')} style={btn('#dc2626', '#fff', '1px solid #fecaca')}>✕ 拒絕</button>
                      </>}
                      {r.status === 'approved' && (
                        <button
                          onClick={() => promoteAndInvite(r.id)}
                          disabled={inviteLoading === r.id}
                          style={{ ...btn('#fff', '#059669'), opacity: inviteLoading === r.id ? 0.7 : 1, flex: 1 }}
                        >
                          {inviteLoading === r.id ? '處理中…' : '🚀 上線 + 產生登入碼'}
                        </button>
                      )}
                      {r.status === 'rejected' && (
                        <button onClick={() => appAction(r.id, 'approve')} style={btn('#fff', '#6b7280')}>↩ 重新通過</button>
                      )}
                    </div>
                    {r.status === 'approved' && (
                      <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', background: '#f9fafb', padding: '6px 10px', borderRadius: 6 }}>
                        ℹ️ 按下「上線 + 產生登入碼」，系統將自動建立導遊帳號並產生首次登入連結
                      </p>
                    )}
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
              <span style={{ fontSize: 13, color: '#6b7280' }}>已上線導遊帳號管理</span>
              <span style={{ fontSize: 13, color: '#9ca3af', marginLeft: 'auto' }}>共 {profiles.length} 位</span>
            </Card>

            {profilesLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>
            ) : profiles.length === 0 ? (
              <Card><EmptyState message="目前沒有已審核的導遊" /></Card>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {profiles.map(p => {
                  const isSuspended = p.verification_status === 'suspended';
                  return (
                    <Card key={p.id} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, opacity: isSuspended ? 0.7 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{p.display_name}</div>
                          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>@{p.slug}</div>
                          {p.headline && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{p.headline}</div>}
                        </div>
                        <span style={{
                          padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                          background: isSuspended ? '#fee2e2' : '#d1fae5',
                          color: isSuspended ? '#dc2626' : '#065f46',
                        }}>
                          {isSuspended ? '已停權' : '已審核'}
                        </span>
                      </div>
                      {p.region && <div style={{ fontSize: 13, color: '#6b7280' }}>📍 {p.region}</div>}
                      <div style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 6, background: '#f9fafb', padding: '6px 10px', borderRadius: 8 }}>
                        <span>✉️</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {p.guide_email || <span style={{ color: '#9ca3af' }}>尚未設定 Email</span>}
                        </span>
                      </div>
                      {/* Row 1: invite + edit */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        {!isSuspended && (
                          <button
                            onClick={() => generateInvite(p.id)}
                            disabled={inviteLoading === p.id}
                            style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                          >
                            {inviteLoading === p.id ? '產生中…' : '🔑 邀請碼'}
                          </button>
                        )}
                        <button
                          onClick={() => setEditState({ guideId: p.id, guideName: p.display_name, email: p.guide_email || '', password: '', confirmPassword: '', loading: false, error: '', success: '', profilePhotoUrl: p.profile_photo_url || '' })}
                          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                          ✏️ 編輯帳號
                        </button>
                      </div>
                      {/* Row 1.5: availability */}
                      <a
                        href={`/admin/guides/${p.id}/availability`}
                        style={{ display: 'block', padding: '8px 0', borderRadius: 8, border: '1px solid #10b981', background: '#ecfdf5', color: '#059669', fontSize: 13, fontWeight: 600, textAlign: 'center', textDecoration: 'none' }}
                      >
                        📅 時間管理
                      </a>
                      {/* Row 2: suspend / reactivate */}
                      <button
                        onClick={() => suspendGuide(p.id, !isSuspended)}
                        disabled={suspendLoading === p.id}
                        style={{
                          width: '100%', padding: '7px 0', borderRadius: 8,
                          border: isSuspended ? '1px solid #bbf7d0' : '1px solid #fecaca',
                          background: '#fff',
                          color: isSuspended ? '#16a34a' : '#dc2626',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          opacity: suspendLoading === p.id ? 0.6 : 1,
                        }}
                      >
                        {suspendLoading === p.id ? '處理中…' : isSuspended ? '✅ 恢復帳號' : '🚫 停權帳號'}
                      </button>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

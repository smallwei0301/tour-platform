'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader } from '../../../../src/components/admin/ui';

export default function AdminSecuritySettingsPage() {
  const [state, setState] = useState<any>(null);
  const [currentToken, setCurrentToken] = useState('');
  const [newToken, setNewToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success'|'error'; text: string }|null>(null);

  async function load() {
    const res = await fetch('/api/admin/auth/security', { cache: 'no-store' });
    setState((await res.json()).data || null);
  }

  useEffect(() => { load(); }, []);

  async function rotate() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/auth/security', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentToken, newToken }) });
      const json = await res.json();
      if (!json.ok) throw new Error(json?.error?.message || 'rotate failed');
      setMsg({ type: 'success', text: 'Token 已旋轉，所有舊 session 已失效。' });
      setCurrentToken(''); setNewToken('');
      await load();
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'rotate failed' });
    } finally { setBusy(false); }
  }

  async function forceLogoutAll() {
    setBusy(true); setMsg(null);
    try {
      await fetch('/api/admin/auth/force-logout-all', { method: 'POST' });
      setMsg({ type: 'success', text: '已強制登出全部 session。' });
      await load();
    } finally { setBusy(false); }
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginTop: 4, boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 14 };

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="安全設定" subtitle="Admin Token 旋轉與強制登出所有 session" />

      <div style={{ padding: '20px 28px', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Status */}
        <Card data-guide="security-version" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#111' }}>目前安全狀態</h3>
          <div className="admin-sec-status" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <style>{`@media (min-width: 480px) { .admin-sec-status { grid-template-columns: 1fr 1fr !important; } @media (min-width: 768px) { .admin-sec-status { grid-template-columns: 1fr 1fr 1fr !important; } } }`}</style>
            {[
              { label: 'Session Version', value: state?.sessionVersion ?? '-' },
              { label: 'Rotated At', value: state?.rotatedAt ? new Date(state.rotatedAt).toLocaleDateString('zh-TW') : '-' },
              { label: 'Force Logout At', value: state?.forcedLogoutAt ? new Date(state.forcedLogoutAt).toLocaleDateString('zh-TW') : '-' },
            ].map(item => (
              <div key={item.label} style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginTop: 4 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Token Rotation */}
        <Card data-guide="security-rotate" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#111' }}>旋轉 Admin Token</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9ca3af' }}>旋轉後，所有舊 session 立即失效。</p>

          <label style={labelStyle}>Current Token</label>
          <input type="password" value={currentToken} onChange={e => setCurrentToken(e.target.value)} style={inputStyle} placeholder="輸入現有 token" />

          <label style={labelStyle}>New Token（至少 8 字元）</label>
          <input type="password" value={newToken} onChange={e => setNewToken(e.target.value)} style={inputStyle} placeholder="輸入新 token" />

          <button onClick={rotate} disabled={busy}
            style={{ marginTop: 16, padding: '9px 24px', borderRadius: 8, border: 'none', background: 'var(--tp-primary)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? '處理中…' : '旋轉 Token'}
          </button>
        </Card>

        {/* Force Logout */}
        <Card data-guide="security-force-logout" style={{ padding: 20, borderColor: '#fecaca' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#111' }}>強制登出所有 Session</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9ca3af' }}>提升 sessionVersion，讓所有既有 cookie 立即失效。</p>

          <button onClick={forceLogoutAll} disabled={busy}
            style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? '處理中…' : '強制登出全部 Session'}
          </button>
        </Card>

        {/* Message */}
        {msg && (
          <div style={{ padding: '12px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#15803d' : '#dc2626', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
            {msg.type === 'success' ? '✅' : '⚠️'} {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

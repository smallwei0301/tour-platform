'use client';

import { useEffect, useState } from 'react';

export default function AdminSecuritySettingsPage() {
  const [state, setState] = useState<any>(null);
  const [currentToken, setCurrentToken] = useState('');
  const [newToken, setNewToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    const res = await fetch('/api/admin/auth/security', { cache: 'no-store' });
    const json = await res.json();
    setState(json.data || null);
  }

  useEffect(() => { load(); }, []);

  async function rotate() {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/admin/auth/security', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentToken, newToken })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json?.error?.message || 'rotate failed');
      setMsg('✅ Token 已旋轉，所有舊 session 已失效。');
      setCurrentToken('');
      setNewToken('');
      await load();
    } catch (err) {
      setMsg(`⚠️ ${err instanceof Error ? err.message : 'rotate failed'}`);
    } finally {
      setBusy(false);
    }
  }

  async function forceLogoutAll() {
    setBusy(true); setMsg('');
    try {
      await fetch('/api/admin/auth/force-logout-all', { method: 'POST' });
      setMsg('✅ 已強制登出全部 session。');
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 680 }}>
      <h1>Admin Security Settings</h1>
      <p style={{ color: '#666' }}>Token 旋轉與強制登出全部 session</p>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>目前安全狀態</h3>
        <p>sessionVersion: <strong>{state?.sessionVersion ?? '-'}</strong></p>
        <p>rotatedAt: {state?.rotatedAt || '-'}</p>
        <p>forcedLogoutAt: {state?.forcedLogoutAt || '-'}</p>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>旋轉 Admin Token</h3>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Current Token
          <input type="password" value={currentToken} onChange={(e) => setCurrentToken(e.target.value)} style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          New Token（至少 8 字元）
          <input type="password" value={newToken} onChange={(e) => setNewToken(e.target.value)} style={{ width: '100%' }} />
        </label>
        <button onClick={rotate} disabled={busy}>Rotate Token</button>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>強制登出全部 session</h3>
        <p style={{ color: '#666' }}>將提升 sessionVersion，讓所有既有 cookie 立即失效。</p>
        <button onClick={forceLogoutAll} disabled={busy}>Force Logout All Sessions</button>
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}

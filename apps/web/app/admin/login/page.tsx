'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { csrfHeaders } from '../../../src/lib/csrf-client';

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') || '/admin';

  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await fetch('/api/admin/auth/csrf', { cache: 'no-store' });
      const res = await fetch('/api/admin/auth/session', {
        method: 'POST', headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ token, email }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json?.error?.message || '登入失敗');
      // Use a full document navigation after Set-Cookie so the middleware and
      // server components read the freshly-created HttpOnly admin cookies.
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗');
    } finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginTop: 4, boxSizing: 'border-box', outline: 'none' };

  return (
    <main style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.07)', padding: '40px 36px', width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🌿</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--tp-primary)' }}>Tour Platform</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Admin Console</div>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin Token</label>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} required style={inputStyle} placeholder="輸入 admin token" />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="owner@example.com" />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ padding: '11px 0', borderRadius: 8, border: 'none', background: loading ? '#9ca3af' : 'var(--tp-primary)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.15s', marginTop: 4 }}>
            {loading ? '登入中…' : '登入 Admin'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#d1d5db' }}>
          Tour Platform Admin Console · 僅限授權人員使用
        </p>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

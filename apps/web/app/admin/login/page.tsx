'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { csrfHeaders } from '../../../src/lib/csrf-client';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/admin';

  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await fetch('/api/admin/auth/csrf', { cache: 'no-store' });
      const res = await fetch('/api/admin/auth/session', {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ token, email }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json?.error?.message || '登入失敗');
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="tp-auth-stage">
      <div className="tp-auth-shell">
        <section className="tp-auth-hero-panel">
          <p className="tp-editorial-kicker">admin console</p>
          <h1 style={{ margin: 0, fontSize: 'clamp(34px, 7vw, 56px)', lineHeight: 1.02 }}>FIELD CONSOLE</h1>
          <p>保留原本 admin token + email 登入流程，只把外殼改成和全站一致的 MIDAO 控台語言。</p>
        </section>

        <section className="tp-auth-panel">
          <p className="tp-editorial-kicker" style={{ color: 'var(--tp-primary)' }}>authorized access</p>
          <h2>登入 Admin</h2>
          <form className="tp-auth-form" onSubmit={onSubmit}>
            <div className="tp-auth-field">
              <label htmlFor="token">Admin Token</label>
              <input id="token" className="tp-auth-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} required placeholder="輸入 admin token" />
            </div>
            <div className="tp-auth-field">
              <label htmlFor="email">Admin Email</label>
              <input id="email" className="tp-auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.com" />
            </div>
            {error && <div className="tp-member-status danger">⚠️ {error}</div>}
            <button type="submit" className="tp-btn tp-btn-primary" disabled={loading}>
              {loading ? '登入中…' : '登入 Admin'}
            </button>
          </form>
          <p className="tp-auth-footnote" style={{ marginTop: 16 }}>僅限授權人員使用。</p>
        </section>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

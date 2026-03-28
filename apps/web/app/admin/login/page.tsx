'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AdminLoginPage() {
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
      const res = await fetch('/api/admin/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, email })
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
    <main style={{ padding: 24, maxWidth: 460, margin: '0 auto' }}>
      <h1>Admin Login</h1>
      <p style={{ color: '#666' }}>輸入 admin token 與 email 建立管理者 session cookie。</p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
        <label>
          Admin Token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>

        <label>
          Admin Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@example.com"
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>

        {error && <p style={{ color: '#b42318', margin: 0 }}>⚠️ {error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? '登入中…' : '登入 Admin'}
        </button>
      </form>

      <p style={{ marginTop: 12, color: '#666', fontSize: 13 }}>
        成功後將自動寫入 <code>admin_token</code> / <code>admin_email</code> cookie。
      </p>
    </main>
  );
}

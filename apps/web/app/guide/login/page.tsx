'use client';

import { Suspense, useMemo, useState } from 'react';
import { csrfHeaders } from '../../../src/lib/csrf-client';

const REQUEST_TIMEOUT_MS = 10000;
const AUTH_REQUEST_TIMEOUT = 'AUTH_REQUEST_TIMEOUT';

function sanitizeGuideNext(next: string | null): string {
  if (!next || !next.startsWith('/guide')) return '/guide/dashboard';
  if (next.startsWith('//')) return '/guide/dashboard';
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(next)) return '/guide/dashboard';
  return next;
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const timeoutError = new Error('request timeout');
      timeoutError.name = AUTH_REQUEST_TIMEOUT;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function GuideLoginForm() {
  const params = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);
  const token = params.get('token') || '';
  const safeNext = sanitizeGuideNext(params.get('next'));
  const router = useMemo(
    () => ({
      push: (nextPath: string) => {
        window.location.assign(nextPath);
      },
    }),
    []
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isFirstTime = !!token;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (isFirstTime && password !== confirmPassword) {
      setError('兩次密碼不一致');
      return;
    }
    if (password.length < 6) {
      setError('密碼至少 6 個字元');
      return;
    }

    setLoading(true);
    try {
      await fetchWithTimeout('/api/guide/auth/csrf', { cache: 'no-store' });

      const body = isFirstTime ? { token, password } : { email: email.trim().toLowerCase(), password };
      const res = await fetchWithTimeout('/api/guide/auth/session', {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (json?.data?.created) {
        router.push(safeNext);
      } else {
        const code = json?.error?.code || '';
        if (code === 'TOKEN_EXPIRED') setError('邀請碼已過期，請聯絡管理員重新產生');
        else if (code === 'INVALID_TOKEN') setError('邀請碼無效或已使用');
        else if (code === 'INVALID_CREDENTIALS') setError('帳號或密碼錯誤');
        else if (code === 'ACCOUNT_SUSPENDED') setError('帳號已停用，請聯絡管理員');
        else setError(json?.error?.message || '登入失敗，請再試一次');
      }
    } catch (error) {
      if (error instanceof Error && error.name === AUTH_REQUEST_TIMEOUT) {
        setError('連線逾時，請稍後再試（若持續發生請聯絡管理員）');
      } else {
        setError('網路錯誤，請再試一次');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '40px 36px', maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(124,58,237,0.12)' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🧭</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1f2937' }}>導遊後台</h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
            {isFirstTime ? '設定你的登入密碼' : '登入你的導遊帳號'}
          </p>
        </div>

        {isFirstTime && (
          <div style={{ background: '#f5f3ff', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#7c3aed', border: '1px solid #ddd6fe' }}>
            👋 歡迎！這是你第一次登入，請設定一個密碼。
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!isFirstTime && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                電子信箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoComplete="email"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none' }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              {isFirstTime ? '設定密碼' : '密碼'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isFirstTime ? '至少 6 個字元' : '輸入密碼'}
              required
              minLength={6}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none' }}
            />
          </div>

          {isFirstTime && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                確認密碼
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再輸入一次密碼"
                required
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none' }}
              />
            </div>
          )}

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ padding: '12px 0', borderRadius: 12, border: 'none', background: loading ? '#a78bfa' : '#7c3aed', color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
          >
            {loading ? '處理中…' : isFirstTime ? '設定密碼並登入' : '登入'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 20 }}>
          需要協助？請聯絡平台管理員
        </p>
      </div>
    </div>
  );
}

export default function GuideLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>載入中…</div>}>
      <GuideLoginForm />
    </Suspense>
  );
}

'use client';

import { createClient } from '../../src/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const next = searchParams.get('next') ?? '/';

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        padding: '24px',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '48px 40px',
          maxWidth: 400,
          width: '100%',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 16 }}>🗺️</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#111' }}>
          歡迎回來
        </h1>
        <p style={{ color: '#6b7280', marginBottom: 32, fontSize: 15 }}>
          登入後即可查看訂單、管理預約
        </p>

        {error && (
          <div
            style={{
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 24,
              fontSize: 14,
            }}
          >
            登入失敗，請再試一次
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          data-testid="google-login-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            width: '100%',
            padding: '14px 24px',
            background: '#fff',
            border: '1.5px solid #d1d5db',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            color: '#111',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          使用 Google 帳號登入
        </button>

        <p style={{ marginTop: 24, fontSize: 13, color: '#9ca3af' }}>
          登入即代表您同意我們的
          <a href="/legal/terms" style={{ color: '#6366f1' }}>服務條款</a>
          {' '}與{' '}
          <a href="/legal/privacy" style={{ color: '#6366f1' }}>隱私政策</a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

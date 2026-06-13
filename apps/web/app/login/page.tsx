'use client';

import Link from 'next/link';
import { createClient } from '../../src/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const next = searchParams.get('next') ?? searchParams.get('redirectTo') ?? '/';

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
    <div className="login-page">
      {/* 山墨背景 — 附件二山景照，上方透出、下方沉入深墨 */}
      <div className="login-bg" aria-hidden />
      <div className="login-bg-veil" aria-hidden />

      <div className="login-shell">
        {/* Hero — 羅盤標誌 + 品牌字標 */}
        <div className="login-hero">
          <div className="login-compass" aria-hidden>
            <svg viewBox="0 0 96 96" width="96" height="96" fill="none">
              <circle cx="48" cy="48" r="43" stroke="rgba(244,236,216,0.55)" strokeWidth="1.4" />
              <path
                d="M48 26 L52.5 43.5 L70 48 L52.5 52.5 L48 70 L43.5 52.5 L26 48 L43.5 43.5 Z"
                fill="#f4ecd8"
              />
            </svg>
          </div>
          <h1 className="login-brand">Midao 祕島</h1>
          <p className="login-brand-sub">台灣在地導遊平台</p>
        </div>

        {/* 登入卡片 */}
        <div className="login-card">
          <h2 className="login-card-title">歡迎回來 👋</h2>
          <p className="login-card-desc">登入後查看訂單、輕鬆管理你的旅行預約</p>

          {error && (
            <div className="login-error">⚠️ 登入失敗，請再試一次</div>
          )}

          {/* Google 登入 */}
          <button
            onClick={handleGoogleLogin}
            data-testid="google-login-btn"
            className="login-google-btn"
          >
            <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            使用 Google 帳號登入
          </button>

          {/* 分隔線 */}
          <div className="login-divider">
            <span />
            <em>或探索我們的行程</em>
            <span />
          </div>

          {/* 探索行程 CTA */}
          <Link href="/activities" className="login-explore-btn">
            <span className="login-explore-icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M3 19h18M6 19l4-9 3 5 2-3 3 7" stroke="#dfeaf2" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx="16.5" cy="6.5" r="2.2" fill="#dfeaf2" />
              </svg>
            </span>
            探索台灣在地行程
          </Link>

          <p className="login-terms">
            登入即代表您同意我們的{' '}
            <a href="/legal/terms">服務條款</a>
            {' '}與{' '}
            <a href="/legal/privacy">隱私政策</a>
          </p>
        </div>

        {/* 回到首頁浮鈕 — 山墨羅盤造型，登入頁的返家入口 */}
        <Link href="/" className="login-fab" aria-label="回到首頁">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 3c2.5 3.5 4 6 4 8a4 4 0 1 1-8 0c0-2 1.5-4.5 4-8Z" fill="#e7dcbf" opacity="0.9" />
            <path d="M5 16h14M5 20h9" stroke="#e7dcbf" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </Link>

        {/* 品牌結語 */}
        <div className="login-tagline">
          <p className="login-tagline-main">島嶼深處，有故事的人帶路。</p>
          <p className="login-tagline-sub">
            在地嚮導 <span>✕</span> 深度路線 <span>✕</span> 真實相遇 <i aria-hidden />
          </p>
        </div>
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

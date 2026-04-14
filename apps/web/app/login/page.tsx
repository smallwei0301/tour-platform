'use client';

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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f9f6f0',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 背景山景照片 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '48%',
        backgroundImage: 'url(https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1200&q=80&fit=crop&crop=center)',
        backgroundSize: 'cover',
        backgroundPosition: 'center 60%',
        borderRadius: '0 0 40% 40% / 0 0 60px 60px',
        zIndex: 0,
        overflow: 'hidden',
      }}>
        {/* 深綠色蒙版 — 保持品牌色調 + 文字可讀 */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(160deg, rgba(27,107,74,0.72) 0%, rgba(13,61,42,0.85) 100%)',
        }} />
      </div>

      {/* 主內容 */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        flex: 1,
        paddingTop: '10vh',
        padding: '10vh 24px 40px',
      }}>
        {/* Logo 區 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {/* 旅行圖示 SVG */}
          <div style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            border: '2px solid rgba(255,255,255,0.3)',
          }}>
            <svg viewBox="0 0 64 64" width="44" height="44" fill="none">
              {/* 飛機 */}
              <path d="M8 32L28 20L32 8L36 20L56 32L36 34L32 56L28 34L8 32Z" fill="white" opacity="0.95"/>
              {/* 地球弧線 */}
              <ellipse cx="32" cy="32" rx="22" ry="22" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none"/>
              <path d="M10 32 Q20 26 32 32 Q44 38 54 32" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none"/>
              <path d="M14 22 Q22 18 32 22 Q42 26 50 22" stroke="rgba(255,255,255,0.3)" strokeWidth="1" fill="none"/>
            </svg>
          </div>

          <h1 style={{
            color: '#fff',
            fontSize: 26,
            fontWeight: 800,
            margin: '0 0 6px',
            letterSpacing: '-0.5px',
          }}>
            Tour Platform
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.75)',
            fontSize: 13,
            margin: 0,
          }}>
            台灣在地導遊平台
          </p>
        </div>

        {/* 登入卡片 */}
        <div style={{
          background: '#fff',
          borderRadius: 24,
          padding: '36px 28px 28px',
          width: '100%',
          maxWidth: 380,
          boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
        }}>
          <h2 style={{
            fontSize: 20,
            fontWeight: 800,
            color: '#1a1a1a',
            margin: '0 0 6px',
          }}>
            歡迎回來 👋
          </h2>
          <p style={{
            fontSize: 14,
            color: '#666',
            margin: '0 0 28px',
            lineHeight: 1.5,
          }}>
            登入後查看訂單、輕鬆管理你的旅行預約
          </p>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 20,
              fontSize: 13,
            }}>
              ⚠️ 登入失敗，請再試一次
            </div>
          )}

          {/* Google 登入按鈕 */}
          <button
            onClick={handleGoogleLogin}
            data-testid="google-login-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              width: '100%',
              padding: '14px 20px',
              background: '#fff',
              border: '1.5px solid #e5e5e5',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              color: '#1a1a1a',
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              transition: 'all 0.15s',
              marginBottom: 16,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#1b6b4a';
              e.currentTarget.style.boxShadow = '0 2px 12px rgba(27,107,74,0.12)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            使用 Google 帳號登入
          </button>

          {/* 分隔線 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
            color: '#ccc',
            fontSize: 12,
          }}>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
            <span>或探索我們的行程</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
          </div>

          {/* 探索行程 CTA */}
          <a
            href="/activities"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: '13px 20px',
              background: 'linear-gradient(135deg, #1b6b4a, #145238)',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
              textDecoration: 'none',
              boxSizing: 'border-box',
            }}
          >
            🗺️ 探索台灣在地行程
          </a>

          <p style={{
            marginTop: 20,
            fontSize: 12,
            color: '#999',
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            登入即代表您同意我們的{' '}
            <a href="/legal/terms" style={{ color: '#1b6b4a', fontWeight: 600 }}>服務條款</a>
            {' '}與{' '}
            <a href="/legal/privacy" style={{ color: '#1b6b4a', fontWeight: 600 }}>隱私政策</a>
          </p>
        </div>

        {/* 底部特色標語 */}
        <div style={{
          marginTop: 28,
          display: 'flex',
          gap: 20,
          color: '#666',
          fontSize: 12,
        }}>
          <span>✅ 實名認證導遊</span>
          <span>💰 透明定價</span>
          <span>🔒 安全付款</span>
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

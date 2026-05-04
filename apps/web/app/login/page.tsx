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
    <main className="tp-auth-stage">
      <div className="tp-auth-shell">
        <section className="tp-auth-hero-panel">
          <p className="tp-editorial-kicker">member login</p>
          <h1 style={{ margin: 0, fontSize: 'clamp(34px, 7vw, 58px)', lineHeight: 1.02 }}>登入後，旅程才真正開始。</h1>
          <p>
            查看訂單、回到付款流程、追蹤退款與後續行程資訊，全部收在同一個 member console。
          </p>
          <div className="tp-editorial-chip-row">
            <span className="tp-editorial-chip">Google OAuth</span>
            <span className="tp-editorial-chip">訂單管理</span>
            <span className="tp-editorial-chip">安全登入</span>
          </div>
        </section>

        <section className="tp-auth-panel">
          <p className="tp-editorial-kicker" style={{ color: 'var(--tp-primary)' }}>tour platform</p>
          <h2>歡迎回來</h2>
          <p style={{ marginTop: 0 }}>登入後可查看 `/me/orders`、繼續付款，或回到你先前的旅程規劃。</p>

          {error && <div className="tp-member-status danger" style={{ marginBottom: 16 }}>⚠️ 登入失敗，請再試一次</div>}

          <div className="tp-auth-form">
            <button type="button" className="tp-btn tp-btn-primary" data-testid="google-login-btn" onClick={handleGoogleLogin}>
              使用 Google 帳號登入
            </button>
            <Link href="/activities" className="tp-btn tp-btn-ghost">先去探索行程</Link>
          </div>

          <p className="tp-auth-footnote" style={{ marginTop: 16 }}>
            登入即代表你同意
            {' '}<Link href="/legal/terms">服務條款</Link>
            {' '}與{' '}
            <Link href="/legal/privacy">隱私政策</Link>。
          </p>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

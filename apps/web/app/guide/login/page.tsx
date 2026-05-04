'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { csrfHeaders } from '../../../src/lib/csrf-client';

function GuideLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const isFirstTime = useMemo(() => Boolean(token), [token]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      await fetch('/api/guide/auth/csrf', { cache: 'no-store' });
      const body = isFirstTime
        ? { token, password }
        : { email: email.trim().toLowerCase(), password };

      const res = await fetch('/api/guide/auth/session', {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (json?.data?.created) {
        router.push('/guide/dashboard');
        return;
      }

      const code = json?.error?.code || '';
      if (code === 'TOKEN_EXPIRED') setError('邀請碼已過期，請聯絡管理員重新產生');
      else if (code === 'INVALID_TOKEN') setError('邀請碼無效或已使用');
      else if (code === 'INVALID_CREDENTIALS') setError('帳號或密碼錯誤');
      else if (code === 'ACCOUNT_SUSPENDED') setError('帳號已停用，請聯絡管理員');
      else setError(json?.error?.message || '登入失敗，請再試一次');
    } catch {
      setError('網路錯誤，請再試一次');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tp-guide-auth-page">
      <section className="tp-guide-auth-hero">
        <div>
          <p className="tp-guide-kicker">guide login</p>
          <h1>{isFirstTime ? '設定你的導遊工作台密碼' : '登入導遊工作台'}</h1>
          <p>
            這裡是 MIDAO 的 FIELD CONSOLE。你可以在同一個工作台管理場次、檢查旅客名單、維護每週可接單時段，
            並在帶團前快速確認今天的準備狀態。
          </p>
          <div className="tp-guide-auth-highlights">
            <div>
              <strong>GUIDE LOGIN</strong>
              <p>保留首次登入 token flow 與一般登入 flow，不改 auth 行為。</p>
            </div>
            <div>
              <strong>FIELD CONSOLE</strong>
              <p>登入後直接進導遊工作台，查看近期訂單、本週場次與時間規則。</p>
            </div>
            <div>
              <strong>MIDAO SUPPORT</strong>
              <p>若邀請碼失效、帳號停用或需要重設密碼，聯絡平台管理員即可協助。</p>
            </div>
          </div>
        </div>

        <div className="tp-guide-hero-meta">
          <span className="tp-guide-chip">🧭 導遊後台</span>
          <span className="tp-guide-chip">📅 場次管理</span>
          <span className="tp-guide-chip">👥 旅客名單</span>
        </div>
      </section>

      <section className="tp-guide-auth-card-wrap">
        <div className="tp-guide-auth-card">
          <p className="tp-guide-kicker">{isFirstTime ? 'first access' : 'member access'}</p>
          <h2 style={{ margin: '0 0 8px' }}>{isFirstTime ? '完成首次啟用' : '登入導遊帳號'}</h2>
          <p style={{ margin: '0 0 18px', color: 'var(--tp-muted)', lineHeight: 1.7 }}>
            {isFirstTime
              ? '你正在使用邀請連結建立密碼。設定完成後，會直接進入導遊工作台。'
              : '輸入你的電子信箱與密碼，進入 MIDAO GUIDE CONSOLE。'}
          </p>

          {isFirstTime && (
            <div className="tp-guide-banner" style={{ marginBottom: 16 }}>
              👋 這是你第一次登入。請先設定一組至少 6 碼的密碼。
            </div>
          )}

          <form className="tp-guide-form" onSubmit={handleSubmit}>
            {!isFirstTime && (
              <div className="tp-guide-field">
                <label htmlFor="guide-email">電子信箱</label>
                <input
                  id="guide-email"
                  className="tp-guide-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoComplete="email"
                />
              </div>
            )}

            <div className="tp-guide-field">
              <label htmlFor="guide-password">{isFirstTime ? '設定密碼' : '密碼'}</label>
              <input
                id="guide-password"
                className="tp-guide-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isFirstTime ? '至少 6 個字元' : '輸入密碼'}
                minLength={6}
                required
              />
            </div>

            {isFirstTime && (
              <div className="tp-guide-field">
                <label htmlFor="guide-confirm-password">確認密碼</label>
                <input
                  id="guide-confirm-password"
                  className="tp-guide-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再輸入一次密碼"
                  required
                />
              </div>
            )}

            {error && (
              <div className="tp-guide-status danger" style={{ justifyContent: 'center' }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" className="tp-btn tp-btn-primary" style={{ width: '100%', textAlign: 'center', padding: '14px 18px' }} disabled={loading}>
              {loading ? '處理中…' : isFirstTime ? '設定密碼並登入' : '登入工作台'}
            </button>
          </form>

          <div className="tp-guide-actions-row" style={{ marginTop: 18 }}>
            <button type="button" className="tp-btn tp-btn-ghost" onClick={() => router.push('/guide/apply')}>
              申請成為導遊
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function GuideLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>載入中…</div>}>
      <GuideLoginForm />
    </Suspense>
  );
}

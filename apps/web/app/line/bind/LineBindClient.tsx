'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

/**
 * LIFF 一鍵綁定（在 LINE 對話內，免碼）。
 *
 * 流程：liff.init → 未登入則 liff.login() → 取 idToken → POST /api/line/auth/verify。
 * verify 會用 idToken 內的 email（LINE Login 授權 email scope 時）直接綁定
 * line_user_id ↔ contact_email，因此**不需登入平台、不需貼綁定碼**。失敗時退回
 * 「我的帳號」的綁定碼流程（/me/profile）。
 */
export default function LineBindClient() {
  const [phase, setPhase] = useState<'init' | 'success' | 'error'>('init');
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) {
        setPhase('error');
        return;
      }
      try {
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login();
          return; // LINE 登入後會導回本頁，effect 再跑一次。
        }
        const idToken = liff.getIDToken();
        if (!idToken) {
          setPhase('error');
          return;
        }
        const res = await fetch('/api/line/auth/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        setPhase(res.ok ? 'success' : 'error');
      } catch {
        setPhase('error');
      }
    })();
  }, []);

  const wrap: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    minHeight: '60vh',
    padding: '2rem',
    textAlign: 'center',
    fontFamily: 'system-ui, sans-serif',
  };

  if (phase === 'success') {
    return (
      <main data-testid="line-bind" data-phase="success" style={wrap}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1f3a24' }}>綁定完成！</h1>
        <p style={{ color: '#5b5b5b' }}>
          回到 LINE 聊天室輸入「我的訂單」，即可隨時查詢訂單與付款。
        </p>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main data-testid="line-bind" data-phase="error" style={wrap}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1f3a24' }}>綁定未完成</h1>
        <p style={{ color: '#5b5b5b' }}>
          無法自動綁定，請改用綁定碼：到「我的帳號」產生綁定碼後貼回 LINE 聊天室。
        </p>
        <Link
          href="/me/profile"
          data-testid="line-bind-fallback"
          style={{
            padding: '12px 20px', background: '#a8511f', color: '#fff',
            borderRadius: 12, fontWeight: 700, textDecoration: 'none',
          }}
        >
          前往我的帳號
        </Link>
      </main>
    );
  }

  return (
    <main data-testid="line-bind" data-phase="init" style={wrap}>
      <p style={{ color: '#5b5b5b' }}>正在透過 LINE 綁定您的帳號…</p>
    </main>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { createClient } from '../../../src/lib/supabase/client';

/**
 * LIFF 一鍵綁定（在 LINE 對話內）。
 *
 * 平台採 Google-only 登入，訂單的權威鍵是 user_id（contact_email 是結帳自填、未必等於
 * Google 或 LINE 信箱）。因此本頁**優先綁 user_id**：先讀平台 session 取 user_id，連同
 * idToken 一起送 /api/line/auth/verify（綁 line_user_id ↔ user_id，最可靠）。若取不到
 * session（訪客、或 LINE webview 未登入），才退回 idToken 內 email 綁定（僅對「LINE 信箱＝
 * 訂單聯絡信箱」的訪客有效）。任何情況下查不到訂單時，卡片會引導改用 /me/profile 綁定碼。
 */
export default function LineBindClient() {
  const [phase, setPhase] = useState<'init' | 'success' | 'success-guest' | 'error'>('init');
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
        // 先取平台 user_id（best-effort）—— 有 session 就綁 user_id（權威），沒有才靠 email。
        let userId: string | undefined;
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          userId = user?.id || undefined;
        } catch {
          userId = undefined;
        }

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
          body: JSON.stringify(userId ? { idToken, userId } : { idToken }),
        });
        if (!res.ok) {
          setPhase('error');
          return;
        }
        // 綁到 user_id = 一定查得到自己的訂單；只綁到 email = 僅當信箱相符才查得到。
        setPhase(userId ? 'success' : 'success-guest');
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

  if (phase === 'success' || phase === 'success-guest') {
    return (
      <main data-testid="line-bind" data-phase={phase} style={wrap}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1f3a24' }}>綁定完成！</h1>
        <p style={{ color: '#5b5b5b' }}>
          回到 LINE 聊天室輸入「我的訂單」，即可隨時查詢訂單與付款。
        </p>
        {phase === 'success-guest' ? (
          <p style={{ color: '#9a6a2f', fontSize: 13 }}>
            提醒：目前以 LINE 信箱綁定。若查不到訂單，請改用「我的帳號」的綁定碼綁定你的會員帳號。
          </p>
        ) : null}
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

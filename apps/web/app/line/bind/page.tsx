import Link from 'next/link';

import { isLineLiffEnabled } from '../../../src/config/feature-flags.mjs';
import LineBindClient from './LineBindClient';

/**
 * `/line/bind` — 公開頁（不在 /me 受保護前綴下），供旅客從 LINE 對話一鍵綁定。
 * Flag ON：真 LIFF 免碼綁定（LineBindClient）。Flag OFF：退回 /me/profile 綁定碼流程。
 */
export default function LineBindPage() {
  if (isLineLiffEnabled()) {
    return <LineBindClient />;
  }

  return (
    <main
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, minHeight: '60vh', padding: '2rem', textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1f3a24' }}>綁定 LINE 訂單通知</h1>
      <p style={{ color: '#5b5b5b' }}>
        請至「我的帳號」產生綁定碼，貼回 LINE 聊天室即可完成綁定。
      </p>
      <Link
        href="/me/profile"
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

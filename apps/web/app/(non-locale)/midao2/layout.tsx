'use client';

// midao2 後台外框：置中 480px 直欄＋固定底部五格 tab bar（任何寬度都是行動版樣式）。
// middleware 不涵蓋 /midao2，登入態改用頁面層 client 探針（401 → 導轉登入）。

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../../src/lib/csrf-client';
import { C, Icon } from './ui';

const TABS = [
  { href: '/midao2', label: '首頁', icon: 'home' },
  { href: '/midao2/requests', label: '需求', icon: 'requests' },
  { href: '/midao2/calendar', label: '行事曆', icon: 'calendar' },
  { href: '/midao2/services', label: '服務', icon: 'services' },
  { href: '/midao2/me', label: '我的頁面', icon: 'profile' },
];

const IMPERSONATION_COOKIE_NAME = 'guide_impersonation';

function hasImpersonationCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .map((c) => c.trim())
    .some((c) => c.startsWith(`${IMPERSONATION_COOKIE_NAME}=`) && !c.startsWith(`${IMPERSONATION_COOKIE_NAME}=;`));
}

export default function Midao2Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    // 預熱 CSRF cookie，供各頁 apiSend 使用。
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    setIsImpersonating(hasImpersonationCookie());

    // auth 探針：只管導轉，不存結果——各頁自行抓資料。
    fetch('/api/v2/guide/midao/summary')
      .then((res) => {
        if (res.status === 401) {
          window.location.assign('/guide/login?next=/midao2');
        }
      })
      .catch(() => {
        // 探針失敗（網路異常）不阻擋畫面，交由各頁自己的錯誤處理。
      });
  }, []);

  // 結束「管理員代入」：清掉導遊 session 與代入標記，回到後台導遊管理。
  async function handleEndImpersonation() {
    try {
      await fetch('/api/guide/auth/session', {
        method: 'DELETE',
        headers: csrfHeaders(),
      });
    } catch {
      // 忽略登出錯誤，仍導回管理後台。
    }
    // 標記 cookie 非 HttpOnly，前端直接清除。
    document.cookie = `${IMPERSONATION_COOKIE_NAME}=; Path=/; Max-Age=0`;
    window.location.href = '/admin/guides';
  }

  return (
    <div style={{ minHeight: '100dvh', background: C.BG, color: C.TEXT }}>
      <main
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '16px 16px calc(84px + env(safe-area-inset-bottom))',
        }}
      >
        {isImpersonating && (
          <div
            data-testid="midao2-impersonation-banner"
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              background: '#7c3aed',
              color: '#fff',
              borderRadius: 12,
              padding: '10px 14px',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            <span>目前以導遊身分代入操作中</span>
            <button
              type="button"
              data-testid="midao2-impersonation-end"
              onClick={handleEndImpersonation}
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                border: 'none',
                background: '#fff',
                color: '#7c3aed',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              結束代入
            </button>
          </div>
        )}
        {children}
      </main>

      <nav
        aria-label="midao2 後台主要導覽"
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 480,
          background: '#fff',
          borderTop: `1px solid ${C.BORDER}`,
          display: 'flex',
          height: 60,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab.href === '/midao2' ? pathname === '/midao2' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              data-testid={'midao2-tab-' + tab.label}
              aria-current={isActive ? 'page' : undefined}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                textDecoration: 'none',
                color: isActive ? C.ACCENT : '#9ca3af',
              }}
            >
              <Icon name={tab.icon} size={22} />
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

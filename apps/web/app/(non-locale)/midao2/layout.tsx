'use client';

// midao2 後台外框：置中 480px 直欄＋固定底部五格 tab bar（任何寬度都是行動版樣式）。
// middleware 不涵蓋 /midao2，登入態改用頁面層 client 探針（401 → 導轉登入）。

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { C, Icon } from './ui';

const TABS = [
  { href: '/midao2', label: '首頁', icon: 'home' },
  { href: '/midao2/requests', label: '需求', icon: 'requests' },
  { href: '/midao2/calendar', label: '行事曆', icon: 'calendar' },
  { href: '/midao2/services', label: '服務', icon: 'services' },
  { href: '/midao2/me', label: '我的頁面', icon: 'profile' },
];

export default function Midao2Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // 預熱 CSRF cookie，供各頁 apiSend 使用。
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });

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

  return (
    <div style={{ minHeight: '100dvh', background: C.BG, color: C.TEXT }}>
      <main
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '16px 16px calc(84px + env(safe-area-inset-bottom))',
        }}
      >
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
                color: isActive ? C.ACCENT : C.MUTED,
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

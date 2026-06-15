'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 會員中心分頁切換（我的訂單 / 我的最愛）。深綠主題、黃銅 active 態，
 * 與全站設計系統一致；響應式可換行。
 */
const TABS = [
  { href: '/me/orders', label: '我的訂單' },
  { href: '/me/wishlist', label: '我的最愛' },
];

export function MemberTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="會員中心"
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 24px' }}
    >
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            data-testid={`member-tab-${t.href.split('/').pop()}`}
            style={{
              fontSize: 14,
              fontWeight: 700,
              padding: '8px 18px',
              borderRadius: 999,
              border: '1px solid',
              borderColor: active ? 'var(--tp-brass)' : 'var(--tp-border)',
              background: active ? 'var(--tp-brass)' : 'transparent',
              color: active ? '#1a2e1f' : 'var(--tp-muted)',
              textDecoration: 'none',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default MemberTabs;

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useClientLocale } from '../../i18n/use-client-locale';
import { getClientNamespace } from '../../i18n/client-nav-messages';

/**
 * 會員中心分頁切換（我的訂單 / 我的最愛）。深綠主題、黃銅 active 態，
 * 與全站設計系統一致；響應式可換行。語言依使用者 NEXT_LOCALE cookie（#multilingual）。
 */
const TABS = [
  { href: '/me/orders', key: 'orders' as const },
  { href: '/me/wishlist', key: 'wishlist' as const },
  { href: '/me/qa', key: 'qa' as const },
  { href: '/me/profile', key: 'profile' as const },
];

export function MemberTabs() {
  const pathname = usePathname();
  const m = getClientNamespace(useClientLocale(), 'memberTabs');
  return (
    <nav
      aria-label={m.aria}
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
            {m[t.key]}
          </Link>
        );
      })}
    </nav>
  );
}

export default MemberTabs;

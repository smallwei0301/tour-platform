"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const bottomNavItems = [
  { label: '首頁', sub: 'HOME', href: '/' },
  { label: '路線', sub: 'ROUTES', href: '/activities' },
  { label: '引路人', sub: 'GUIDES', href: '/guides' },
  { label: '我的', sub: 'PROFILE', href: '/me/orders' },
];

export default function MidaoBottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <nav className="midao-bottom-nav" aria-label="底部導覽">
      <div className="midao-bottom-nav-inner">
        {bottomNavItems.map((item) => {
          const active = isActive(item.href);
          return (
          <Link key={item.label} href={item.href} className={active ? 'midao-bottom-item is-active' : 'midao-bottom-item'}>
            <strong>{item.label}</strong>
            <span>{item.sub}</span>
          </Link>
        );})}
      </div>
    </nav>
  );
}

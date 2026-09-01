'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MIDAO_NAV_ITEMS, activeMidaoNavId, type MidaoNavItem } from './nav-items';

const NAV_ICONS: Readonly<Record<MidaoNavItem['icon'], string>> = {
  home: '⌂',
  inbox: '✉',
  calendar: '▦',
  briefcase: '◇',
  person: '○',
};

export function MidaoBottomNav() {
  const pathname = usePathname();
  const activeId = activeMidaoNavId(pathname);

  return (
    <nav className="midao-bottom-nav" aria-label="Midao 主導航">
      {MIDAO_NAV_ITEMS.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="midao-bottom-nav__item"
          aria-current={activeId === item.id ? 'page' : undefined}
        >
          <span className="midao-bottom-nav__icon" aria-hidden="true">{NAV_ICONS[item.icon]}</span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

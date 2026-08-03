'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MIDAO_NAV_ITEMS, activeMidaoNavId } from './nav-items';

export function MidaoDesktopSidebar() {
  const activeId = activeMidaoNavId(usePathname());

  return (
    <aside className="midao-desktop-sidebar">
      <Link href="/midao" className="midao-desktop-sidebar__brand" aria-label="Midao 首頁">
        <span aria-hidden="true">祕</span>
        <strong>Midao</strong>
      </Link>
      <nav className="midao-desktop-sidebar__nav" aria-label="Midao 主導航">
        {MIDAO_NAV_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="midao-desktop-sidebar__item"
            aria-current={activeId === item.id ? 'page' : undefined}
          >
            <span className="midao-desktop-sidebar__mark" aria-hidden="true">{item.label.slice(0, 1)}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}

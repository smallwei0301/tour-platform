export type MidaoNavId = 'home' | 'requests' | 'orders' | 'calendar' | 'services' | 'me';

export type MidaoNavItem = Readonly<{
  id: MidaoNavId;
  label: string;
  href: string;
  icon: 'home' | 'inbox' | 'calendar' | 'briefcase' | 'person';
}>;

export const MIDAO_NAV_ITEMS: readonly MidaoNavItem[] = Object.freeze([
  { id: 'home', label: '首頁', href: '/midao', icon: 'home' },
  { id: 'requests', label: '需求', href: '/midao/requests', icon: 'inbox' },
  { id: 'orders', label: '訂單', href: '/midao/orders', icon: 'briefcase' },
  { id: 'calendar', label: '行事曆', href: '/midao/calendar', icon: 'calendar' },
  { id: 'services', label: '服務', href: '/midao/services', icon: 'briefcase' },
  { id: 'me', label: '我的頁面', href: '/midao/me', icon: 'person' },
]);

export function activeMidaoNavId(pathname: string): MidaoNavId | null {
  const normalized = pathname === '/midao/' ? '/midao' : pathname;
  if (normalized === '/midao') return 'home';
  const match = MIDAO_NAV_ITEMS.slice(1).find(
    (item) => normalized === item.href || normalized.startsWith(`${item.href}/`),
  );
  return match?.id ?? null;
}

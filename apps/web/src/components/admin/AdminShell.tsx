'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AdminSessionBar } from './AdminSessionBar';
import { AdminGuide } from './AdminGuide';
import { useIsMobile } from './responsive';
import { csrfHeaders, readCsrfTokenFromCookie } from '../../lib/csrf-client';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: '📊', exact: true },
  { href: '/admin/activities', label: '行程管理', icon: '🗺️' },
  { href: '/admin/homepage', label: '首頁精選', icon: '🏝️' },
  { href: '/admin/orders', label: '訂單管理', icon: '🧾' },
  { href: '/admin/refunds', label: '退款管理', icon: '↩️' },
  { href: '/admin/payouts', label: '出款管理', icon: '💸' },
  { href: '/admin/guides', label: '導遊審核', icon: '🧭' },
  { href: '/admin/promo-codes', label: '折扣碼', icon: '🎟️' },
  { href: '/admin/reviews', label: '評價管理', icon: '⭐' },
  { href: '/admin/qa', label: 'Q&A管理', icon: '💬' },
  { href: '/admin/operations-tracking', label: '操作追蹤', icon: '📈' },
  { href: '/admin/go-no-go', label: 'Go/No-Go', icon: '🚦' },
  { href: '/admin/soft-launch', label: '軟啟動控制', icon: '🎛️' },
  { href: '/admin/settings/kpi', label: '設定', icon: '⚙️' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile(768);
  const isDesktop = !isMobile;

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Prime CSRF cookie and auto-attach x-csrf-token for admin mutation APIs.
  useEffect(() => {
    void fetch('/api/admin/auth/csrf', { cache: 'no-store' });

    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      const isMutation = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const isAdminApi = url.startsWith('/api/admin/');

      if (isMutation && isAdminApi) {
        const token = readCsrfTokenFromCookie();
        const headers = new Headers(init?.headers || {});
        if (token && !headers.get('x-csrf-token')) headers.set('x-csrf-token', token);
        return originalFetch(input, { ...init, headers });
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const isSkipShell = pathname === '/admin/login' || pathname === '/admin/unauthorized';
  if (isSkipShell) return <>{children}</>;

  function isActive(item: { href: string; exact?: boolean }) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + '/');
  }

  async function logout() {
    await fetch('/api/admin/auth/session', { method: 'DELETE', headers: csrfHeaders() });
    router.push('/admin/login');
  }

  const navLinks = (onClickExtra?: () => void) => NAV_ITEMS.map((item) => {
    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClickExtra}
        aria-current={active ? 'page' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 8, marginBottom: 2,
          background: active ? 'var(--tp-primary)' : 'transparent',
          color: active ? '#fff' : '#374151',
          fontWeight: active ? 700 : 500,
          fontSize: 14, textDecoration: 'none',
        }}
      >
        <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
        {item.label}
      </Link>
    );
  });

  const sidebarContent = (onClose?: () => void) => (
    <>
      {/* Logo */}
      <div style={{ padding: '22px 20px 14px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--tp-primary)' }}>🌿 Midao 祕島</div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Admin Console</div>
        </div>
        {onClose && (
          <button aria-label="關閉選單" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', padding: 4 }}>✕</button>
        )}
      </div>
      {/* Nav */}
      <nav aria-label="管理後台導覽" style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {navLinks(onClose)}
      </nav>
      {/* Logout */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid #f0f0f0' }}>
        <button onClick={logout}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>🚪</span> 登出
        </button>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f9fafb', color: '#111827' }}>

      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      {isDesktop && (
        <aside style={{
          width: 240, minWidth: 240, height: '100vh',
          background: '#fff', borderRight: '1px solid #e5e7eb',
          display: 'flex', flexDirection: 'column',
          position: 'sticky', top: 0, overflowY: 'auto', flexShrink: 0,
        }}>
          {sidebarContent()}
        </aside>
      )}

      {/* ── Mobile Drawer Overlay ── */}
      {!isDesktop && mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          {/* Backdrop */}
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }}
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div role="dialog" aria-modal="true" aria-label="管理導覽選單" style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: 260,
            background: '#fff', zIndex: 10, display: 'flex', flexDirection: 'column',
            boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
          }}>
            {sidebarContent(() => setMobileOpen(false))}
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: '100vh' }}>

        {/* Mobile Topbar (hidden on desktop) */}
        {!isDesktop && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', borderBottom: '1px solid #e5e7eb',
            background: '#fff', position: 'sticky', top: 0, zIndex: 100,
          }}>
            <button
              onClick={() => setMobileOpen(true)}
              style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', background: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: '#374151' }}
              aria-label="開啟選單"
            >
              ☰
            </button>
            <span style={{ fontWeight: 700, color: 'var(--tp-primary)', fontSize: 15 }}>🌿 Midao 祕島 Admin</span>
          </div>
        )}

        <AdminSessionBar />
        <main style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </main>
        <AdminGuide pathname={pathname} />
      </div>
    </div>
  );
}

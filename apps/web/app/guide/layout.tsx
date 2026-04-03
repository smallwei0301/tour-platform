'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/guide/dashboard', label: '儀表板', icon: '📊' },
  { href: '/guide/schedules', label: '場次管理', icon: '📅' },
  { href: '/guide/bookings', label: '訂單查看', icon: '📋' },
];

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Don't show nav on login page
  if (pathname === '/guide/login') return <>{children}</>;

  async function handleLogout() {
    await fetch('/api/guide/auth/session', { method: 'DELETE' });
    router.push('/guide/login');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* ── Desktop Top Navbar ── */}
      <nav style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        height: 56,
        gap: 8,
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {/* Logo */}
        <div
          onClick={() => router.push('/guide/dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginRight: 16, flexShrink: 0 }}
        >
          <span style={{ fontSize: 22 }}>🧭</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#1f2937', whiteSpace: 'nowrap' }}>導遊後台</span>
        </div>

        {/* Desktop Nav Links (hidden on mobile) */}
        <div className="guide-desktop-nav" style={{ display: 'flex', gap: 4, flex: 1 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: isActive ? '#f5f3ff' : 'transparent',
                  color: isActive ? '#7c3aed' : '#6b7280',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Desktop Logout (hidden on mobile) */}
        <button
          className="guide-desktop-nav"
          onClick={handleLogout}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#fff',
            color: '#6b7280',
            fontSize: 13,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          登出
        </button>

        {/* Mobile Hamburger (shown on mobile) */}
        <button
          className="guide-mobile-hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            marginLeft: 'auto',
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#fff',
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* ── Mobile Dropdown Menu ── */}
      {menuOpen && (
        <div
          className="guide-mobile-menu"
          style={{
            position: 'fixed',
            top: 56,
            left: 0,
            right: 0,
            background: '#fff',
            borderBottom: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            zIndex: 49,
            padding: '8px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <button
                key={item.href}
                onClick={() => { router.push(item.href); setMenuOpen(false); }}
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: isActive ? '#f5f3ff' : 'transparent',
                  color: isActive ? '#7c3aed' : '#374151',
                  fontSize: 15,
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
          <div style={{ borderTop: '1px solid #f3f4f6', margin: '4px 0' }} />
          <button
            onClick={() => { handleLogout(); setMenuOpen(false); }}
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'transparent',
              color: '#dc2626',
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 18 }}>🚪</span>
            <span>登出</span>
          </button>
        </div>
      )}

      {/* ── Mobile Bottom Tab Bar ── */}
      <div
        className="guide-mobile-tabbar"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          height: 60,
          zIndex: 50,
          boxShadow: '0 -1px 4px rgba(0,0,0,0.04)',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '6px 0',
                color: isActive ? '#7c3aed' : '#9ca3af',
              }}
            >
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500 }}>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Responsive CSS */}
      <style>{`
        /* Desktop: show top nav, hide hamburger & bottom bar */
        .guide-desktop-nav { display: flex !important; }
        .guide-mobile-hamburger { display: none !important; }
        .guide-mobile-tabbar { display: none !important; }

        @media (max-width: 640px) {
          /* Mobile: hide desktop nav, show hamburger & bottom bar */
          .guide-desktop-nav { display: none !important; }
          .guide-mobile-hamburger { display: block !important; }
          .guide-mobile-tabbar { display: flex !important; }
        }
      `}</style>

      {/* Page Content (with bottom padding for mobile tab bar) */}
      <main style={{ padding: '24px 16px', maxWidth: 1200, margin: '0 auto', paddingBottom: 80 }}>
        {children}
      </main>
    </div>
  );
}

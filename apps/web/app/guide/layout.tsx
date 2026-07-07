'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../src/lib/csrf-client';

const NAV_ITEMS = [
  { href: '/guide/dashboard', label: '儀表板', icon: '📊' },
  { href: '/guide/activities', label: '我的行程', icon: '📝' },
  { href: '/guide/availability', label: '時間管理', icon: '🕐' },
  { href: '/guide/schedules', label: '場次管理', icon: '📅' },
  { href: '/guide/conflict-overrides', label: '幫手確認', icon: '🤝' },
  { href: '/guide/bookings', label: '訂單查看', icon: '📋' },
  { href: '/guide/redeem', label: '憑證核銷', icon: '🎫' },
  { href: '/guide/messages', label: '旅客訊息', icon: '💬' },
  { href: '/guide/reviews', label: '評論回覆', icon: '⭐' },
  { href: '/guide/profile', label: '公開頁面', icon: '👤' },
];

const IMPERSONATION_COOKIE_NAME = 'guide_impersonation';

function hasImpersonationCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .map((c) => c.trim())
    .some((c) => c.startsWith(`${IMPERSONATION_COOKIE_NAME}=`) && !c.startsWith(`${IMPERSONATION_COOKIE_NAME}=;`));
}

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    setIsImpersonating(hasImpersonationCookie());
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
    document.cookie = `${IMPERSONATION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    window.location.href = '/admin/guides';
  }

  // Close the mobile dropdown whenever the route changes (back button,
  // bottom-tab tap, programmatic nav — anything that isn't an item click).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // 公開頁面（登入、成為導遊申請）不套用導遊後台外框（top nav / bottom tabbar）。
  // 「成為導遊」是對外招募頁，應沿用站台首頁風格，而非後台導覽。
  if (
    pathname === '/guide/login' ||
    pathname === '/guide/apply' ||
    pathname.startsWith('/guide/apply/') ||
    pathname === '/guide/new-activity' ||
    pathname.startsWith('/guide/new-activity/')
  ) {
    return <>{children}</>;
  }

  async function handleLogout() {
    await fetch('/api/guide/auth/session', {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    router.push('/guide/login');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f9fafb',
        color: '#111827',
        // Accent palette consumed by ResponsiveTable's selected-row styles.
        // Keeps the guide subtree purple while admin keeps green via the
        // CSS-var fallback (var(--rt-accent, var(--tp-primary))).
        ['--rt-accent' as any]: '#7c3aed',
        ['--rt-accent-soft' as any]: '#f5f3ff',
      }}
    >
      {/* ── 管理員代入模式橫幅 ── */}
      {isImpersonating && (
        <div
          data-testid="guide-impersonation-banner"
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
            background: '#7c3aed',
            color: '#fff',
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          <span>🛡️ 管理員代入模式：您正以此導遊身分操作導遊後台</span>
          <button
            onClick={handleEndImpersonation}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            結束代入，返回管理後台
          </button>
        </div>
      )}

      {/* ── Desktop Top Navbar ── */}
      <nav aria-label="導遊後台主要導覽" style={{
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
                aria-current={isActive ? 'page' : undefined}
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
          aria-label={menuOpen ? '關閉導覽選單' : '開啟導覽選單'}
          aria-expanded={menuOpen}
          aria-controls="guide-mobile-menu"
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
        <>
          {/* Outside-click backdrop (sits below the dropdown, above content). */}
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              top: 56,
              background: 'transparent',
              zIndex: 48,
            }}
            aria-hidden
          />
        <div
          id="guide-mobile-menu"
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
            maxHeight: 'calc(100dvh - 56px - 60px)',
            overflowY: 'auto',
          }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <button
                key={item.href}
                onClick={() => { router.push(item.href); setMenuOpen(false); }}
                aria-current={isActive ? 'page' : undefined}
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
        </>
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
          paddingBottom: 'env(safe-area-inset-bottom)',
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
              aria-current={isActive ? 'page' : undefined}
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

      {/* Page Content (with bottom padding for mobile tab bar + iPhone safe area). */}
      <main
        style={{
          padding: '24px 16px',
          maxWidth: 1200,
          margin: '0 auto',
          paddingBottom: 'calc(80px + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </main>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { csrfHeaders } from '../../src/lib/csrf-client';

const NAV_ITEMS = [
  { href: '/guide/dashboard', label: '儀表板', icon: '📊', note: '訂單與本週場次' },
  { href: '/guide/bookings', label: '訂單查看', icon: '📋', note: '旅客資訊與聯絡資料' },
  { href: '/guide/schedules', label: '場次管理', icon: '🗓️', note: '開關場次與容量' },
  { href: '/guide/availability', label: '時間管理', icon: '🕐', note: '每週規則與休假' },
];

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isLoginPage = pathname === '/guide/login';
  const isApplyPage = pathname === '/guide/apply';

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await fetch('/api/guide/auth/session', {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    router.push('/guide/login');
  }

  if (isLoginPage || isApplyPage) {
    return <>{children}</>;
  }

  return (
    <div className="tp-guide-shell">
      <header className="tp-guide-topbar">
        <div className="tp-container tp-guide-topbar-inner">
          <div className="tp-guide-brand" onClick={() => router.push('/guide/dashboard')}>
            <div className="tp-guide-brand-mark">🧭</div>
            <div className="tp-guide-brand-copy">
              <strong>MIDAO GUIDE CONSOLE</strong>
              <span>導遊工作台 · 場次、時間與旅客名單</span>
            </div>
          </div>

          <nav className="tp-guide-nav" aria-label="Guide navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <button
                  key={item.href}
                  type="button"
                  className={`tp-guide-nav-link${isActive ? ' is-active' : ''}`}
                  onClick={() => router.push(item.href)}
                >
                  {item.icon} {item.label}
                </button>
              );
            })}
          </nav>

          <div className="tp-guide-actions">
            <button type="button" className="tp-guide-logout" onClick={handleLogout}>
              登出
            </button>
            <button
              type="button"
              className="tp-guide-icon-btn"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="tp-container" style={{ paddingTop: 12 }}>
          <div className="tp-guide-panel tp-guide-mobile-sheet">
            <div className="tp-guide-card-list">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <button
                    key={item.href}
                    type="button"
                    className={`tp-guide-nav-link${isActive ? ' is-active' : ''}`}
                    style={{ justifyContent: 'flex-start', width: '100%', textAlign: 'left' }}
                    onClick={() => router.push(item.href)}
                  >
                    {item.icon} {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <main className="tp-guide-main">
        <div className="tp-container">{children}</div>
      </main>

      <div
        className="tp-guide-mobile-tab"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 45,
          background: 'rgba(255,255,255,0.96)',
          borderTop: '1px solid rgba(27,107,74,0.12)',
          padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
          display: 'none',
          gap: 8,
          justifyContent: 'space-between',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
              style={{
                flex: 1,
                border: 'none',
                background: isActive ? 'rgba(27,107,74,0.10)' : 'transparent',
                color: isActive ? 'var(--tp-primary)' : '#6b7280',
                borderRadius: 16,
                padding: '10px 6px',
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              <div style={{ fontSize: 18, marginBottom: 4 }}>{item.icon}</div>
              {item.label}
            </button>
          );
        })}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .tp-guide-mobile-tab { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AdminSessionBar } from './AdminSessionBar';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: '📊', exact: true },
  { href: '/admin/orders', label: '訂單管理', icon: '🧾' },
  { href: '/admin/refunds', label: '退款管理', icon: '↩️' },
  { href: '/admin/guides', label: '導遊審核', icon: '🧭' },
  { href: '/admin/operations-tracking', label: '操作追蹤', icon: '📈' },
  { href: '/admin/settings/kpi', label: '設定', icon: '⚙️' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isSkipShell = pathname === '/admin/login' || pathname === '/admin/unauthorized';
  if (isSkipShell) return <>{children}</>;

  function isActive(item: { href: string; exact?: boolean }) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + '/');
  }

  async function logout() {
    await fetch('/api/admin/auth/session', { method: 'DELETE' });
    router.push('/admin/login');
  }

  const Sidebar = () => (
    <aside style={{
      width: 240, minWidth: 240, height: '100vh', background: '#fff',
      borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--tp-primary)', letterSpacing: '-0.3px' }}>
          🌿 Tour Platform
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 2, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Admin Console
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, marginBottom: 2,
                background: active ? 'var(--tp-primary)' : 'transparent',
                color: active ? '#fff' : '#374151',
                fontWeight: active ? 700 : 500,
                fontSize: 14, textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom logout */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid #f0f0f0' }}>
        <button
          onClick={logout}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: '1px solid #e5e7eb', background: '#fff',
            color: '#6b7280', fontSize: 14, fontWeight: 500,
            cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <span>🚪</span> 登出
        </button>
      </div>
    </aside>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f9fafb' }}>
      {/* Desktop Sidebar */}
      <div style={{ display: 'none' }} className="admin-sidebar-desktop">
        <Sidebar />
      </div>
      <aside style={{
        width: 240, minWidth: 240, height: '100vh', background: '#fff',
        borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--tp-primary)', letterSpacing: '-0.3px' }}>
            🌿 Tour Platform
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 2, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Admin Console
          </div>
        </div>
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <Link key={item.href} href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8, marginBottom: 2,
                  background: active ? 'var(--tp-primary)' : 'transparent',
                  color: active ? '#fff' : '#374151',
                  fontWeight: active ? 700 : 500,
                  fontSize: 14, textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div style={{ padding: '12px 10px', borderTop: '1px solid #f0f0f0' }}>
          <button onClick={logout}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid #e5e7eb', background: '#fff',
              color: '#6b7280', fontSize: 14, fontWeight: 500,
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span>🚪</span> 登出
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={() => setMobileOpen(false)} />
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 240, background: '#fff', zIndex: 10, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--tp-primary)' }}>🌿 Tour Platform</div>
              <button onClick={() => setMobileOpen(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}>✕</button>
            </div>
            <nav style={{ flex: 1, padding: '12px 10px' }}>
              {NAV_ITEMS.map((item) => {
                const active = isActive(item);
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8, marginBottom: 2,
                      background: active ? 'var(--tp-primary)' : 'transparent',
                      color: active ? '#fff' : '#374151',
                      fontWeight: active ? 700 : 500, fontSize: 14, textDecoration: 'none',
                    }}
                  >
                    <span>{item.icon}</span>{item.label}
                  </Link>
                );
              })}
            </nav>
            <div style={{ padding: '12px 10px', borderTop: '1px solid #f0f0f0' }}>
              <button onClick={logout}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 14, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <span>🚪</span> 登出
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: '100vh' }}>
        {/* Mobile topbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', position: 'sticky', top: 0, zIndex: 30 }}>
          <button onClick={() => setMobileOpen(true)}
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', background: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >
            ☰
          </button>
          <span style={{ fontWeight: 700, color: 'var(--tp-primary)', fontSize: 15 }}>🌿 Tour Platform Admin</span>
        </div>

        <AdminSessionBar />
        <main style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

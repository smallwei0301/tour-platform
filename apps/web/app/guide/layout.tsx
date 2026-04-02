'use client';

import { useRouter, usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/guide/dashboard', label: '儀表板', icon: '📊' },
  { href: '/guide/schedules', label: '場次管理', icon: '📅' },
  { href: '/guide/bookings', label: '訂單查看', icon: '📋' },
];

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // Don't show nav on login page
  if (pathname === '/guide/login') return <>{children}</>;

  async function handleLogout() {
    await fetch('/api/guide/auth/session', { method: 'DELETE' });
    router.push('/guide/login');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Top Navbar */}
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
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginRight: 24 }}
        >
          <span style={{ fontSize: 22 }}>🧭</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#1f2937' }}>導遊後台</span>
        </div>

        {/* Nav Links */}
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
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
                  transition: 'all 0.15s',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#fff',
            color: '#6b7280',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          登出
        </button>
      </nav>

      {/* Page Content */}
      <main style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}

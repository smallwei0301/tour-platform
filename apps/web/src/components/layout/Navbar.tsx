'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';
import type { User } from '@supabase/supabase-js';

const NAV_LINKS = [
  { label: '探索行程', href: '/activities' },
  { label: '認識導遊', href: '/guides' },
  { label: '成為導遊', href: '/guide/apply' },
  { label: '旅遊指南', href: '/blog' },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    // Get initial session
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoadingUser(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/activities?q=${encodeURIComponent(q)}` : '/activities');
    setMenuOpen(false);
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '用戶';

  return (
    <header className="tp-navbar">
      <div className="tp-navbar-inner tp-navbar-full">
        {/* Logo */}
        <Link href="/" className="tp-logo">Tour Platform</Link>

        {/* Desktop: search bar */}
        <form onSubmit={handleSearch} className="tp-search-shell tp-nav-search-desktop" aria-label="搜尋">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋行程、目的地⋯"
            className="tp-search-input"
          />
          <button
            type="submit"
            className="tp-btn tp-btn-primary"
            style={{ borderRadius: '0 24px 24px 0', padding: '10px 18px' }}
          >
            🔍
          </button>
        </form>

        {/* Desktop nav links */}
        <nav className="tp-nav-links" aria-label="主要導覽">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}

          {!loadingUser && (
            user ? (
              <>
                <Link
                  href="/me/orders"
                  style={{ fontSize: 14, color: '#374151' }}
                  data-testid="nav-my-orders"
                >
                  我的訂單
                </Link>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {user.user_metadata?.avatar_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.user_metadata.avatar_url}
                      alt={displayName}
                      width={28}
                      height={28}
                      style={{ borderRadius: '50%', objectFit: 'cover' }}
                    />
                  )}
                  <span
                    style={{ fontSize: 14, color: '#374151', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    data-testid="nav-user-name"
                  >
                    {displayName}
                  </span>
                  <button
                    onClick={handleSignOut}
                    data-testid="nav-sign-out-btn"
                    className="tp-btn"
                    style={{
                      border: '1.5px solid #d1d5db',
                      color: '#6b7280',
                      padding: '6px 14px',
                      fontSize: 13,
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    登出
                  </button>
                </div>
              </>
            ) : (
              <Link
                href="/login"
                data-testid="nav-login-btn"
                className="tp-btn"
                style={{
                  border: '1.5px solid var(--tp-primary)',
                  color: 'var(--tp-primary)',
                  padding: '6px 16px',
                  fontSize: 14,
                }}
              >
                登入 / 註冊
              </Link>
            )
          )}
        </nav>

        {/* Hamburger (mobile only) */}
        <button
          className="tp-hamburger"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? '關閉選單' : '開啟選單'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <span style={{ fontSize: 20, lineHeight: 1 }}>✕</span>
          ) : (
            <span className="tp-hamburger-icon">
              <span />
              <span />
              <span />
            </span>
          )}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <nav className="tp-mobile-menu" aria-label="手機導覽">
          <div className="tp-container">
            <form onSubmit={handleSearch} className="tp-mobile-search">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋行程、目的地⋯"
                className="tp-search-input"
              />
              <button type="submit" className="tp-btn tp-btn-primary" style={{ padding: '10px 16px' }}>
                🔍
              </button>
            </form>
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="tp-mobile-menu-item"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link href="/me/orders" className="tp-mobile-menu-item" onClick={() => setMenuOpen(false)}>
                  我的訂單
                </Link>
                <button
                  onClick={() => { handleSignOut(); setMenuOpen(false); }}
                  className="tp-mobile-menu-item"
                  style={{ background: 'none', border: 'none', textAlign: 'left', width: '100%', cursor: 'pointer', color: '#6b7280' }}
                >
                  登出（{displayName}）
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="tp-mobile-menu-item"
                onClick={() => setMenuOpen(false)}
              >
                登入 / 註冊
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

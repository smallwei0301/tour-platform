'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { PublicIcon } from '../ui/PublicIcon';

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
  const pathname = usePathname();

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

  // Drawer 開啟時鎖住背景捲動
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

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
        <Link href="/" className="tp-logo">MIDAO <span className="tp-logo-zh">祕島</span></Link>

        {/* Desktop: search bar */}
        <form onSubmit={handleSearch} className="tp-search-shell tp-nav-search-desktop" aria-label="搜尋">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋行程、目的地⋯"
            className="tp-search-input"
            aria-label="搜尋行程或目的地"
          />
          <button
            type="submit"
            className="tp-btn tp-btn-primary"
            style={{ borderRadius: '0 24px 24px 0', padding: '10px 18px' }}
          >
            <PublicIcon name="search" size={16} />
          </button>
        </form>

        {/* Desktop nav links */}
        <nav className="tp-nav-links" aria-label="主要導覽">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href)) ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}

          {!loadingUser && (
            user ? (
              <>
                <Link
                  href="/me/orders"
                  style={{ fontSize: 14, color: 'rgba(244,236,216,0.82)' }}
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
                      style={{ borderRadius: '50%', objectFit: 'cover' }} />
                  )}
                  <span
                    style={{ fontSize: 14, color: 'rgba(244,236,216,0.82)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    data-testid="nav-user-name"
                  >
                    {displayName}
                  </span>
                  <button
                    onClick={handleSignOut}
                    data-testid="nav-sign-out-btn"
                    className="tp-btn"
                    style={{
                      border: '1.5px solid rgba(244,236,216,0.35)',
                      color: 'rgba(244,236,216,0.7)',
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
                  border: '1.5px solid var(--tp-brass)',
                  color: '#f1e9d4',
                  padding: '6px 16px',
                  fontSize: 14,
                }}
              >
                登入 / 註冊
              </Link>
            )
          )}
        </nav>

        {/* Hamburger (mobile only) — 三線 morph 成 X */}
        <button
          className="tp-hamburger"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? '關閉選單' : '開啟選單'}
          aria-expanded={menuOpen}
        >
          <span className={`tp-hamburger-icon${menuOpen ? ' is-open' : ''}`}>
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      {/* Mobile drawer backdrop */}
      <div
        className={`tp-mobile-backdrop${menuOpen ? ' is-open' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile drawer（常駐渲染以套用滑入 transition；關閉時 inert 防止聚焦） */}
      <nav
        className={`tp-mobile-menu${menuOpen ? ' is-open' : ''}`}
        aria-label="手機導覽"
        inert={!menuOpen}
      >
        <div className="tp-container">
          <form
            onSubmit={handleSearch}
            className="tp-mobile-search"
            style={{ transitionDelay: menuOpen ? '110ms' : '0ms' }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋行程、目的地⋯"
              className="tp-search-input"
              aria-label="搜尋行程或目的地"
            />
            <button type="submit" className="tp-btn tp-btn-primary" style={{ padding: '10px 16px' }}>
              <PublicIcon name="search" size={16} />
            </button>
          </form>
          {NAV_LINKS.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              className="tp-mobile-menu-item"
              onClick={() => setMenuOpen(false)}
              aria-current={pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href)) ? 'page' : undefined}
              style={{ transitionDelay: menuOpen ? `${170 + i * 60}ms` : '0ms' }}
            >
              {l.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link
                href="/me/orders"
                className="tp-mobile-menu-item"
                onClick={() => setMenuOpen(false)}
                style={{ transitionDelay: menuOpen ? '410ms' : '0ms' }}
              >
                我的訂單
              </Link>
              <button
                onClick={() => { handleSignOut(); setMenuOpen(false); }}
                className="tp-mobile-menu-item"
                style={{
                  background: 'none', border: 'none', textAlign: 'left', width: '100%', cursor: 'pointer', color: 'rgba(244,236,216,0.7)',
                  transitionDelay: menuOpen ? '470ms' : '0ms',
                }}
              >
                登出（{displayName}）
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="tp-mobile-menu-item"
              onClick={() => setMenuOpen(false)}
              style={{ transitionDelay: menuOpen ? '410ms' : '0ms' }}
            >
              登入 / 註冊
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}

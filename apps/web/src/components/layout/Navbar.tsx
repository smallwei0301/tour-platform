'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import MidaoLogo from '../midao/MidaoLogo';

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
  const isHome = pathname === '/';
  const isActivities = pathname?.startsWith('/activities');

  useEffect(() => {
    if (isHome) {
      setLoadingUser(false);
      return;
    }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoadingUser(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [isHome]);

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

  if (isHome) return null;

  return (
    <header className={`tp-navbar${isActivities ? ' tp-navbar-overlay' : ''}`}>
      <div className={`tp-navbar-inner tp-navbar-full tp-navbar-home-like${isActivities ? ' tp-navbar-inner-overlay' : ''}`}>
        <Link href="/" className="midao-brand" aria-label="祕島首頁">
          <span className="midao-brand-mark">
            <MidaoLogo />
          </span>
          <span>
            <strong>祕島</strong>
            <small>MIDAO · SECRET ISLE</small>
          </span>
        </Link>

        <div className="midao-top-actions" aria-label="導覽操作">
          <button
            className="midao-icon-btn"
            aria-label="搜尋路線"
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⌕
          </button>
          <button
            className="midao-icon-btn"
            aria-label={menuOpen ? '關閉選單' : '開啟選單'}
            aria-expanded={menuOpen}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

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
              <Link key={l.href} href={l.href} className="tp-mobile-menu-item" onClick={() => setMenuOpen(false)}>
                {l.label}
              </Link>
            ))}

            {!loadingUser && (
              user ? (
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
                <Link href="/login" className="tp-mobile-menu-item" onClick={() => setMenuOpen(false)}>
                  登入 / 註冊
                </Link>
              )
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

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

  // LP 首頁導覽列透明、fixed 浮在 hero 洞穴照上；捲過整個 hero 區後才加半透明深色底。
  const isHome = pathname === '/';
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isHome) {
      setScrolled(false);
      return;
    }
    // 關鍵：關閉瀏覽器的捲動位置還原。否則在頁面下方重新整理時，瀏覽器會
    // 自動還原捲動位置（例如 scrollY=1200）並觸發 scroll 事件，導致導覽列在
    // 載入瞬間就被判定為「已捲動」而套上深色底。改為 manual 後，重新整理一律
    // 從頂端開始 → 導覽列載入即透明；僅在使用者真的向下捲過 hero 後才加深色底。
    let prevRestoration: History['scrollRestoration'] | undefined;
    try {
      if ('scrollRestoration' in window.history) {
        prevRestoration = window.history.scrollRestoration;
        window.history.scrollRestoration = 'manual';
      }
    } catch {}
    window.scrollTo(0, 0);
    setScrolled(false);

    const onScroll = () => {
      const hero = document.querySelector('.lp-hero') as HTMLElement | null;
      const heroH = hero ? hero.offsetHeight : 0;
      // 門檻＝hero 高度減導覽列高；hero 尚未排版（offsetHeight 0）時用視窗高
      // 當保守值，並設下限 200px —— 避免量到 0 算出負門檻而「載入即判定已捲動」。
      const threshold = Math.max(heroH > 0 ? heroH - 64 : window.innerHeight * 0.7, 200);
      setScrolled(window.scrollY > threshold);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      try {
        if ('scrollRestoration' in window.history && prevRestoration) {
          window.history.scrollRestoration = prevRestoration;
        }
      } catch {}
    };
  }, [isHome]);

  return (
    <header className={`tp-navbar${isHome ? ' tp-navbar--transparent' : ''}${isHome && scrolled ? ' tp-navbar--scrolled' : ''}`}>
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

        {/* Hamburger (mobile only) */}
        <button
          className="tp-hamburger"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? '關閉選單' : '開啟選單'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <span style={{ display: 'inline-flex', lineHeight: 1 }}><PublicIcon name="close" size={20} /></span>
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
                aria-label="搜尋行程或目的地"
              />
              <button type="submit" className="tp-btn tp-btn-primary" style={{ padding: '10px 16px' }}>
                <PublicIcon name="search" size={16} />
              </button>
            </form>
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="tp-mobile-menu-item"
                onClick={() => setMenuOpen(false)}
                aria-current={pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href)) ? 'page' : undefined}
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
                  style={{ background: 'none', border: 'none', textAlign: 'left', width: '100%', cursor: 'pointer', color: 'rgba(244,236,216,0.7)' }}
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

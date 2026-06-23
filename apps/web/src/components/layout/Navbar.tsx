'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { PublicIcon } from '../ui/PublicIcon';
import { LanguageSwitcher } from './LanguageSwitcher';
import { detectLocale } from '../../i18n/locale-path';
import { getNavMessages } from '../../i18n/client-nav-messages';

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Navbar 在 NextIntlClientProvider 之外 → 依 pathname 前綴自行決定 locale 與文案。
  // 切換器 router.push('/en') 後 pathname 變動，此處重算 → 導覽列文字立即切語言。
  const locale = detectLocale(pathname || '/');
  const m = getNavMessages(locale);
  const NAV_LINKS = [
    { label: m.nav.explore, href: '/activities' },
    { label: m.nav.guides, href: '/guides' },
    { label: m.nav.becomeGuide, href: '/guide/apply' },
    { label: m.nav.blog, href: '/blog' },
  ];

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

  // 搜尋導去 /activities 時保留目前 locale 前綴（en → /en/activities）。
  const activitiesBase = locale === 'zh-Hant' ? '/activities' : `/${locale}/activities`;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `${activitiesBase}?q=${encodeURIComponent(q)}` : activitiesBase);
    setMenuOpen(false);
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '用戶';

  // LP 首頁導覽列透明、fixed 浮在 hero 洞穴照上；捲過整個 hero 區後才加半透明深色底。
  // 重要：是否為首頁「不」以 usePathname() 判定 —— production ISR（revalidate）重新整理時
  // server 端 usePathname 可能回 null 使導覽列被快取成實心底。透明狀態改由 CSS
  // body:has(.lp-root) 驅動（SSR/ISR/client 皆正確）；此處僅以 DOM（.lp-hero）在 client
  // 偵測首頁來掛載捲動邏輯，並加 .tp-navbar--home 作為不支援 :has() 舊瀏覽器的後備。
  const [isHome, setIsHome] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const hero = document.querySelector('.lp-hero') as HTMLElement | null;
    const onHome = !!hero;
    setIsHome(onHome);
    if (!onHome) {
      setScrolled(false);
      return;
    }
    // 根因：在頁面下方重新整理時，瀏覽器會還原捲動位置並觸發 scroll 事件，使導覽列
    // 載入瞬間就被判定為「已捲動」而套上深色底。對策：首頁關閉捲動位置還原（manual）
    // 並回到頂端，確保載入一律透明；僅在使用者真的向下捲過 hero 後才加深色底。
    // 另在 root layout 以 inline script 於 hydration 前就把 manual 設好作為雙重保險。
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
  }, [pathname]);

  return (
    <header className={`tp-navbar${isHome ? ' tp-navbar--home' : ''}${isHome && scrolled ? ' tp-navbar--scrolled' : ''}`}>
      <div className="tp-navbar-inner tp-navbar-full">
        {/* Logo */}
        <Link href="/" className="tp-logo">MIDAO <span className="tp-logo-zh">祕島</span></Link>

        {/* Desktop: search bar */}
        <form onSubmit={handleSearch} className="tp-search-shell tp-nav-search-desktop" aria-label={m.common.search}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m.common.searchPlaceholder}
            className="tp-search-input"
            aria-label={m.common.searchPlaceholder}
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

          <LanguageSwitcher className="tp-lang-switch--desktop" />

          {!loadingUser && (
            user ? (
              <>
                <Link
                  href="/me/orders"
                  style={{ fontSize: 14, color: 'rgba(244,236,216,0.82)' }}
                  data-testid="nav-my-trips"
                >
                  {m.nav.myTrips}
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
                    {m.nav.logout}
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
                {m.nav.login}
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
                placeholder={m.common.searchPlaceholder}
                className="tp-search-input"
                aria-label={m.common.searchPlaceholder}
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
            <div className="tp-mobile-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LanguageSwitcher />
            </div>
            {user ? (
              <>
                <Link href="/me/orders" className="tp-mobile-menu-item" data-testid="nav-mobile-my-trips" onClick={() => setMenuOpen(false)}>
                  {m.nav.myTrips}
                </Link>
                <button
                  onClick={() => { handleSignOut(); setMenuOpen(false); }}
                  className="tp-mobile-menu-item"
                  style={{ background: 'none', border: 'none', textAlign: 'left', width: '100%', cursor: 'pointer', color: 'rgba(244,236,216,0.7)' }}
                >
                  {m.nav.logout}（{displayName}）
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="tp-mobile-menu-item"
                onClick={() => setMenuOpen(false)}
              >
                {m.nav.login}
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const NAV_LINKS = [
  { label: '探索行程', href: '/activities' },
  { label: '認識導遊', href: '/guides' },
  { label: '成為導遊', href: '/guide/apply' },
  { label: '旅遊指南', href: '/blog' },
  { label: '我的訂單', href: '/me/orders' },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/activities?q=${encodeURIComponent(q)}` : '/activities');
    setMenuOpen(false);
  }

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
          <Link
            href="/auth/sign-in"
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
            {[...NAV_LINKS, { label: '登入 / 註冊', href: '/auth/sign-in' }].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="tp-mobile-menu-item"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

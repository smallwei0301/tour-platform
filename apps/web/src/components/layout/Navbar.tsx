'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function Navbar() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/activities?q=${encodeURIComponent(q)}` : '/activities');
  }

  return (
    <header className="tp-navbar">
      <div className="tp-container tp-navbar-inner">
        <Link href="/" className="tp-logo">Tour Platform</Link>
        <form onSubmit={handleSearch} className="tp-search-shell" aria-label="搜尋" style={{
          background: '#fff', borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 4px 18px rgba(0,0,0,0.1)',
        }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋行程、地區、導遊⋯"
            className="tp-search-input"
            style={{ padding: '10px 14px' }}
          />
          <button
            type="submit"
            className="tp-btn tp-btn-primary"
            style={{ borderRadius: '0 12px 12px 0', padding: '10px 18px' }}
          >
            搜尋 🔍
          </button>
        </form>
        <nav className="tp-nav-links" aria-label="主要導覽">
          <Link href="/activities">探索行程</Link>
          <Link href="/guides">認識導遊</Link>
          <Link href="/guide/apply">成為導遊</Link>
          <Link href="/blog">旅遊指南</Link>
          <Link
            href="/auth/sign-in"
            className="tp-btn"
            style={{ border: '1.5px solid var(--tp-primary)', color: 'var(--tp-primary)', padding: '6px 16px', fontSize: 14 }}
          >
            登入
          </Link>
        </nav>
      </div>
    </header>
  );
}

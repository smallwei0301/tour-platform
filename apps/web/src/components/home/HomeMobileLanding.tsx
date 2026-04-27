'use client';

import Link from 'next/link';

type Chip = {
  label: string;
  href: string;
  icon: string;
};

const chips: Chip[] = [
  { label: '柴山探洞', href: '/theme/cave-exploration', icon: '⛰' },
  { label: '老街漫遊', href: '/activities?category=walking', icon: '🏮' },
  { label: '美食導覽', href: '/activities?category=food', icon: '🍜' },
  { label: '野外溯溪', href: '/theme/river-trekking', icon: '🌊' },
];

const navItems = [
  { label: '首頁', href: '/', icon: '⬢', active: true },
  { label: '探索', href: '/activities', icon: '◉' },
  { label: '行程', href: '/orders', icon: '▦' },
  { label: '導遊', href: '/guides', icon: '◍' },
  { label: '我的', href: '/login', icon: '●' },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tp-home-icon-svg">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.2 16.2 21 21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tp-home-icon-svg">
      <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tp-home-input-icon-svg">
      <path d="M12 21s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10Z" fill="currentColor" opacity="0.18" />
      <path d="M12 21s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="11" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function HomeMobileLanding() {
  return (
    <main className="tp-home-page">
      <div className="tp-home-shell">
        <section className="tp-home-hero">
          <div className="tp-home-topbar">
            <Link href="/" className="tp-home-logo" style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700 }}>
              Tour Platform
            </Link>

            <div className="tp-home-topbar-actions">
              <button type="button" className="tp-home-icon-btn" aria-label="搜尋">
                <SearchIcon />
              </button>
              <button type="button" className="tp-home-icon-btn" aria-label="選單">
                <MenuIcon />
              </button>
            </div>
          </div>

          <div className="tp-home-hero-copy">
            <span className="tp-home-pill">台灣在地導遊平台</span>
            <h1>找到最懂台灣的人，帶你深度探索秘境</h1>
            <p>專屬導遊 × 深度行程，讓每段旅程都更貼近在地生活與故事。</p>
          </div>

          <div className="tp-home-search-card">
            <div className="tp-home-search-input">
              <span className="tp-home-input-icon">
                <PinIcon />
              </span>
              <span className="tp-home-input-text">你想去哪裡旅行？</span>
            </div>

            <Link href="/activities" className="tp-home-search-cta">
              開始找行程
            </Link>
          </div>
        </section>

        <section className="tp-home-section tp-home-chip-section">
          <div className="tp-home-section-head">
            <h2>🔥 熱門主題</h2>
          </div>

          <div className="tp-home-chip-row">
            {chips.map((chip) => (
              <Link key={chip.label} href={chip.href} className="tp-home-chip">
                <span className="tp-home-chip-icon">{chip.icon}</span>
                <span>{chip.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="tp-home-section tp-home-featured-section">
          <div className="tp-home-section-head tp-home-featured-head">
            <h2>精選行程</h2>
          </div>

          <article className="tp-home-featured-card">
            <div
              className="tp-home-featured-image"
              role="img"
              aria-label="高雄柴山秘境探洞行程"
            >
              <span className="tp-home-featured-badge">★ 精選行程</span>
            </div>

            <div className="tp-home-featured-body">
              <h3>高雄柴山秘境探洞｜在地嚮導帶路</h3>

              <div className="tp-home-featured-footer">
                <div className="tp-home-featured-meta-inline">
                  <span>高雄｜半日體驗</span>
                  <span className="tp-home-rating">★ 5.0 ★</span>
                </div>

                <div className="tp-home-featured-price-row">
                  <span className="tp-home-price">NT$2,000</span>
                  <span className="tp-home-price-unit">/ 人</span>
                </div>
              </div>
            </div>
          </article>
        </section>
      </div>

      <nav className="tp-home-bottom-nav" aria-label="首頁底部導覽">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`tp-home-bottom-item${item.active ? ' is-active' : ''}`}
          >
            <span className="tp-home-bottom-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}

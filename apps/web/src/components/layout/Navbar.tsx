import Link from 'next/link';

const CATEGORY_PILLS = [
  { label: '🔦 探洞體驗', href: '/theme/cave-exploration' },
  { label: '🌊 溯溪冒險', href: '/theme/river-trekking' },
  { label: '🏙️ 老街漫遊', href: '/activities?category=old-street' },
  { label: '🌿 生態導覽', href: '/activities?category=eco' },
  { label: '🍜 美食文化', href: '/activities?category=food' },
  { label: '🏔️ 登山健行', href: '/activities?category=hiking' },
  { label: '🎨 藝術工坊', href: '/activities?category=art' },
  { label: '🌺 原住民文化', href: '/activities?category=indigenous' },
];

export function Navbar() {
  return (
    <header className="tp-navbar">
      {/* Main row */}
      <div className="tp-container tp-navbar-main">
        <Link href="/" className="tp-logo">Tour Platform</Link>
        <div className="tp-search-shell" aria-label="搜尋">
          <input placeholder="要去哪裡？台北、花蓮、高雄⋯" className="tp-search-input" />
          <button
            className="tp-btn tp-btn-primary"
            style={{ borderRadius: '0 24px 24px 0', padding: '10px 18px' }}
          >
            🔍
          </button>
        </div>
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

      {/* Category pills row */}
      <div className="tp-navbar-pills-wrap">
        <div className="tp-container">
          <div className="tp-navbar-pills">
            {CATEGORY_PILLS.map((p) => (
              <Link key={p.href} href={p.href} className="tp-navbar-pill">
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

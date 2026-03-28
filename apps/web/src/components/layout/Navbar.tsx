import Link from 'next/link';

export function Navbar() {
  return (
    <header className="tp-navbar">
      <div className="tp-container tp-navbar-inner">
        <Link href="/" className="tp-logo">Tour Platform</Link>
        <div className="tp-search-shell" aria-label="搜尋">
          <input placeholder="要去哪裡？台北、花蓮、高雄⋯" className="tp-search-input" />
          <button className="tp-btn tp-btn-primary" style={{ borderRadius: '0 24px 24px 0' }}>🔍</button>
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
    </header>
  );
}

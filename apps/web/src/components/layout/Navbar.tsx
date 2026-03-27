import Link from 'next/link';

export function Navbar() {
  return (
    <header className="tp-navbar">
      <div className="tp-container tp-navbar-inner">
        <Link href="/" className="tp-logo">Tour Platform</Link>
        <div className="tp-search-shell" aria-label="搜尋">
          <input placeholder="要去哪裡？" className="tp-search-input" />
          <button className="tp-btn tp-btn-primary">搜尋</button>
        </div>
        <nav className="tp-nav-links" aria-label="主要導覽">
          <Link href="/activities">探索行程</Link>
          <Link href="/guides">認識導遊</Link>
          <Link href="/guide/apply">成為導遊</Link>
        </nav>
      </div>
    </header>
  );
}

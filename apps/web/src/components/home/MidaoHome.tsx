import Link from 'next/link';
import { featuredRoutes } from '../../../data/midaoHomeData';

const quickFilters = [
  { label: '柴山探洞', href: '/activities/kaohsiung/kaohsiung-chaishan-cave-experience' },
  { label: '大稻埕老街', href: '/activities/taipei/dadadaocheng-walk' },
  { label: '花蓮溪谷', href: '/activities/hualien/hualien-river-trekking' },
];

const bottomNav = [
  { label: '首頁', sub: 'Home', href: '/' },
  { label: '路線', sub: 'Routes', href: '/activities' },
  { label: '引路人', sub: 'Guides', href: '/guides' },
  { label: '我的', sub: 'Profile', href: '/login' },
];

export function MidaoHome() {
  const primaryRoute = featuredRoutes.find((route) => route.isPrimary) ?? featuredRoutes[0];
  const secondaryRoutes = featuredRoutes.filter((route) => route.id !== primaryRoute?.id);

  return (
    <main className="midao-home">
      <section className="midao-hero">
        <div className="midao-hero-overlay" />
        <div className="midao-shell midao-hero-content">
          <header className="midao-topbar">
            <Link href="/" className="midao-brand" aria-label="祕島首頁">
              <span className="midao-brand-mark">◌</span>
              <span>
                <strong>祕島</strong>
                <small>MIDAO · SECRET ISLE</small>
              </span>
            </Link>
            <div className="midao-top-actions" aria-label="首頁操作">
              <Link href="/activities" className="midao-icon-btn" aria-label="搜尋路線">
                ⌕
              </Link>
              <Link href="/guides" className="midao-icon-btn" aria-label="開啟選單">
                ☰
              </Link>
            </div>
          </header>

          <div className="midao-copy">
            <p className="midao-eyebrow">Field Guide to Hidden Taiwan</p>
            <h1>
              島嶼裡，
              <br />
              還有一座島。
            </h1>
            <p className="midao-subtitle">An island, untold.</p>
            <p className="midao-subcopy">
              不是觀光清單，而是跟著真正熟路的人，走進台灣那些還保有霧氣、地形與故事密度的路線深處。
            </p>
            <div className="midao-cta-row">
              <Link href="/activities" data-testid="home-cta-explore" className="midao-btn midao-btn-primary">
                尋找一條你的徑
              </Link>
              <Link href="/guides" data-testid="home-cta-guides" className="midao-btn midao-btn-secondary">
                遇見引路人
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="midao-search-wrap">
        <div className="midao-shell">
          <div className="midao-search-card">
            <form action="/activities" method="get" className="midao-search-form">
              <label htmlFor="midao-search" className="midao-search-label">
                這次，想往哪一種台灣裡走？
              </label>
              <div className="midao-search-row">
                <input
                  id="midao-search"
                  name="q"
                  className="midao-search-input"
                  placeholder="你想走哪一條徑？"
                />
                <button type="submit" className="midao-search-submit">
                  ⌕
                </button>
              </div>
            </form>
            <div className="midao-chip-row" aria-label="快速分類">
              {quickFilters.map((item) => (
                <Link key={item.label} href={item.href} className="midao-chip">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="midao-notes-section">
        <div className="midao-shell">
          <div className="midao-section-head">
            <div>
              <p className="midao-kicker">This Month&apos;s Field Notes</p>
              <h2>本月祕境檔案</h2>
            </div>
            <Link href="/activities" className="midao-more-link">
              看更多行程 →
            </Link>
          </div>

          {primaryRoute ? (
            <div className="midao-notes-grid">
              <article className="midao-feature-card">
                <div className="midao-feature-thumb" style={{ backgroundImage: `linear-gradient(180deg, rgba(27, 31, 28, 0.06) 0%, rgba(27, 31, 28, 0.26) 100%), url(${primaryRoute.image})` }} />
                <div className="midao-feature-body">
                  <div className="midao-feature-meta">
                    <span>{primaryRoute.rating.toFixed(1)}</span>
                    <span>{primaryRoute.groupSize}</span>
                    <span>{primaryRoute.duration}</span>
                  </div>
                  <h3>{primaryRoute.title}</h3>
                  {primaryRoute.guideName ? <p className="midao-feature-guide">由 {primaryRoute.guideName} 帶路</p> : null}
                  <p>{primaryRoute.summary ?? primaryRoute.tagline}</p>
                  <div className="midao-feature-footer">
                    <span className="midao-feature-price">{primaryRoute.priceLabel}</span>
                    <Link href={primaryRoute.href} className="midao-inline-link">
                      {primaryRoute.cta} →
                    </Link>
                  </div>
                </div>
              </article>

              <div className="midao-secondary-list">
                {secondaryRoutes.map((route) => (
                  <article key={route.id} className="midao-secondary-card">
                    <div className="midao-secondary-thumb" style={{ backgroundImage: `linear-gradient(180deg, rgba(27, 31, 28, 0.06) 0%, rgba(27, 31, 28, 0.22) 100%), url(${route.image})` }} />
                    <div className="midao-secondary-meta">
                      <span>{route.location}</span>
                      <span>{route.duration}</span>
                    </div>
                    <h3>{route.title}</h3>
                    {route.guideName ? <p className="midao-secondary-guide">由 {route.guideName} 帶路</p> : null}
                    <p>{route.summary ?? route.tagline}</p>
                    <div className="midao-secondary-footer">
                      <span className="midao-secondary-price">{route.priceLabel}</span>
                      <Link href={route.href} className="midao-inline-link">
                        查看行程 →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <nav className="midao-bottom-nav" aria-label="主要頁籤">
        {bottomNav.map((item, index) => (
          <Link key={item.label} href={item.href} className={`midao-bottom-item${index === 0 ? ' is-active' : ''}`}>
            <strong>{item.label}</strong>
            <span>{item.sub}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}

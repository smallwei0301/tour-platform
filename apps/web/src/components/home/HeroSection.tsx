import Link from 'next/link';

const HOT_TAGS = ['台北老街', '高雄柴山', '花蓮溯溪', '台南美食', '墾丁浮潛'];

export function HeroSection() {
  return (
    <section
      className="tp-hero"
      style={{
        backgroundImage:
          'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(https://images.unsplash.com/photo-1528164344705-47542687000d?w=1600&q=80)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '520px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div className="tp-container" style={{ width: '100%' }}>
        <p className="tp-kicker" style={{ color: '#E8834D', fontSize: 15 }}>
          🗺️ 台灣在地導遊平台
        </p>
        <h1
          style={{
            color: '#fff',
            textShadow: '0 2px 8px rgba(0,0,0,0.3)',
            marginBottom: 28,
          }}
        >
          找到懂路的人，
          <br />
          帶你走進台灣最有故事的地方
        </h1>

        {/* Search Widget */}
        <div className="tp-hero-search-widget">
          <div className="tp-hero-search-field">
            <span className="tp-hero-search-label">📍 目的地</span>
            <input
              className="tp-hero-search-input"
              placeholder="台北、花蓮、高雄⋯"
            />
          </div>
          <div className="tp-hero-search-divider" />
          <div className="tp-hero-search-field">
            <span className="tp-hero-search-label">📅 出發日期</span>
            <input className="tp-hero-search-input" type="date" />
          </div>
          <div className="tp-hero-search-divider" />
          <div className="tp-hero-search-field">
            <span className="tp-hero-search-label">👥 人數</span>
            <input
              className="tp-hero-search-input"
              type="number"
              placeholder="2 人"
              min={1}
              max={20}
            />
          </div>
          <Link
            href="/activities"
            className="tp-btn tp-btn-primary tp-hero-search-btn"
          >
            🔍 搜尋行程
          </Link>
        </div>

        {/* Hot tags */}
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
            熱門搜尋：
          </span>
          {HOT_TAGS.map((tag) => (
            <Link
              key={tag}
              href={`/activities?q=${encodeURIComponent(tag)}`}
              style={{
                background: 'rgba(255,255,255,0.18)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff',
                padding: '5px 12px',
                borderRadius: 999,
                fontSize: 13,
              }}
            >
              {tag}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

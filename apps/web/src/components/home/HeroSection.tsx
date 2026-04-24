'use client';

import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="tp-hero" style={{
      backgroundImage: 'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.58)), url(https://images.unsplash.com/photo-1528164344705-47542687000d?w=1600&q=80)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      minHeight: '560px',
      display: 'flex',
      alignItems: 'center',
    }}>
      <div className="tp-container" style={{ textAlign: 'left', alignItems: 'flex-start' }}>
        <p className="tp-kicker" style={{ color: '#E8834D', letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>
          台灣在地導遊平台
        </p>
        <h1 style={{ color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.35)', fontSize: 'clamp(30px, 5vw, 50px)', lineHeight: 1.3, maxWidth: 740 }}>
          找到懂路的人，
          <br />
          帶你走進台灣最有故事的地方
        </h1>
        <p className="tp-hero-sub" style={{ color: 'rgba(255,255,255,0.9)', maxWidth: 560, lineHeight: 1.75 }}>
          不跟團、不趕路。直接預約在地導遊，把行程留給真正熟悉這片土地的人。
        </p>

        <div className="tp-cta-row" style={{ marginTop: 26, alignItems: 'center' }}>
          <Link
            href="/activities"
            data-testid="home-cta-explore"
            className="tp-btn tp-btn-primary"
            style={{ fontSize: 16, padding: '13px 28px' }}
          >
            探索精選行程
          </Link>
          <Link
            href="/guides"
            data-testid="home-cta-guides"
            style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 4 }}
          >
            先看看在地導遊
          </Link>
        </div>
      </div>
    </section>
  );
}

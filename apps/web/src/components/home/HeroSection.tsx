'use client';

import Link from 'next/link';

export function HeroSection() {
  return (
    <section
      className="tp-hero"
      style={{
        backgroundImage:
          'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.58)), url(https://images.unsplash.com/photo-1528164344705-47542687000d?w=1600&q=80)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '560px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div className="tp-container" style={{ textAlign: 'left', alignItems: 'flex-start' }}>
        <p className="tp-kicker" style={{ color: '#E8834D', letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>
          不是逛景點，是把這趟旅程變成你的故事
        </p>
        <h1
          style={{
            color: '#fff',
            textShadow: '0 2px 10px rgba(0,0,0,0.35)',
            fontSize: 'clamp(30px, 5vw, 50px)',
            lineHeight: 1.28,
            maxWidth: 740,
            marginBottom: 14,
          }}
        >
          跟著懂路的在地人，
          <br />
          用更深的方式認識台灣
        </h1>
        <p className="tp-hero-sub" style={{ color: 'rgba(255,255,255,0.9)', maxWidth: 560, lineHeight: 1.72 }}>
          從一開始就選對帶路者，少走冤枉路、避開觀光模板，把每一次移動都變成值得回憶的體驗。
        </p>

        <div className="tp-cta-row" style={{ marginTop: 28, alignItems: 'center', gap: 12 }}>
          <Link href="/activities" data-testid="home-cta-explore" className="tp-btn tp-btn-primary" style={{ fontSize: 16, padding: '13px 28px' }}>
            先看本週精選路線
          </Link>
          <Link
            href="/guides"
            data-testid="home-cta-guides"
            className="tp-btn"
            style={{
              fontSize: 15,
              padding: '12px 22px',
              color: '#fff',
              borderColor: 'rgba(255,255,255,0.65)',
              background: 'rgba(255,255,255,0.08)',
            }}
          >
            再挑適合你的導遊
          </Link>
        </div>
      </div>
    </section>
  );
}

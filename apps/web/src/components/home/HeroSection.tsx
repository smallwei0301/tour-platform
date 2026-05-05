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
        alignItems: 'flex-start',
        paddingTop: '28px',
      }}
    >
      <div className="tp-container" style={{ textAlign: 'left', alignItems: 'flex-start' }}>
        <p className="tp-kicker" style={{ color: '#E8834D', letterSpacing: 1.6, fontWeight: 700, marginBottom: 8 }}>
          Field Guide to Hidden Taiwan
        </p>
        <h1
          style={{
            color: '#fff',
            textShadow: '0 2px 10px rgba(0,0,0,0.35)',
            fontSize: 'clamp(32px, 5vw, 52px)',
            lineHeight: 1.22,
            maxWidth: 740,
            marginBottom: 14,
          }}
        >
          找到一條你的徑
        </h1>
        <p className="tp-hero-sub" style={{ color: 'rgba(255,255,255,0.9)', maxWidth: 620, lineHeight: 1.72 }}>
          不是景點清單，而是依照你的步調，把台灣的地形、城市紋理與在地故事拼成一段真正會記住的路線。
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

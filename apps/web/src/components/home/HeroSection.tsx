import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="tp-hero" style={{
      backgroundImage: 'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(https://images.unsplash.com/photo-1528164344705-47542687000d?w=1600&q=80)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      minHeight: '540px',
      display: 'flex',
      alignItems: 'center',
    }}>
      <div className="tp-container">
        <p className="tp-kicker" style={{ color: '#E8834D' }}>台灣在地導遊平台</p>
        <h1 style={{ color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
          找到懂路的人，<br />帶你走進台灣最有故事的地方
        </h1>
        <p className="tp-hero-sub" style={{ color: 'rgba(255,255,255,0.9)' }}>
          不跟團、不趕路。預約在地導遊，用你的節奏認識這座島嶼。<br />
          柴山探洞、大稻埕老街、花蓮溯溪⋯⋯ 你選行程，我們找最懂的人帶路。
        </p>
        <div className="tp-trust-grid" style={{ gridTemplateColumns: 'repeat(4, auto)', gap: '16px', maxWidth: 600 }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '10px 14px', borderRadius: 10, textAlign: 'center', fontSize: 14 }}>✅ 實名認證導遊</div>
          <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '10px 14px', borderRadius: 10, textAlign: 'center', fontSize: 14 }}>💰 透明定價</div>
          <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '10px 14px', borderRadius: 10, textAlign: 'center', fontSize: 14 }}>🔒 安全付款</div>
          <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '10px 14px', borderRadius: 10, textAlign: 'center', fontSize: 14 }}>📞 即時支援</div>
        </div>
        <div className="tp-cta-row" style={{ marginTop: 28 }}>
          <Link href="/activities" className="tp-btn tp-btn-primary" style={{ fontSize: 16, padding: '14px 32px' }}>
            探索行程
          </Link>
          <Link href="/guides" className="tp-btn tp-btn-ghost" style={{ fontSize: 16, padding: '14px 32px', borderColor: '#fff', color: '#fff' }}>
            認識導遊
          </Link>
        </div>
      </div>
    </section>
  );
}

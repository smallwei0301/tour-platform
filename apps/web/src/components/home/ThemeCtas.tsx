import Link from 'next/link';

export function ThemeCtas() {
  return (
    <section className="tp-section">
      <div className="tp-container">
        <div className="tp-section-head"><h2>🏷️ 特色主題</h2></div>
        <div className="tp-theme-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="tp-theme" style={{
            backgroundImage: 'linear-gradient(rgba(74,92,58,0.75), rgba(74,92,58,0.85)), url(https://images.unsplash.com/photo-1504699439244-a9a8618cafc6?w=800&q=80)',
            backgroundSize: 'cover', backgroundPosition: 'center', minHeight: 220, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}>
            <h3>🔦 柴山探洞</h3>
            <p>鑽進高雄的秘密地下世界，探索億萬年石灰岩洞穴</p>
            <Link href="/theme/cave-exploration" className="tp-link" style={{ color: '#fff' }}>探索柴山行程 →</Link>
          </div>
          <div className="tp-theme" style={{
            backgroundImage: 'linear-gradient(rgba(26,74,107,0.75), rgba(26,74,107,0.85)), url(https://images.unsplash.com/photo-1504858700536-882c978a3464?w=800&q=80)',
            backgroundSize: 'cover', backgroundPosition: 'center', minHeight: 220, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}>
            <h3>🌊 野外溯溪</h3>
            <p>走進台灣最純淨的野溪，用雙腳感受花蓮的力量</p>
            <Link href="/theme/river-trekking" className="tp-link" style={{ color: '#fff' }}>探索溯溪行程 →</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

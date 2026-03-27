import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="tp-hero">
      <div className="tp-container">
        <p className="tp-kicker">台灣在地導遊平台</p>
        <h1>發現屬於你的台灣，由在地導遊帶路</h1>
        <p className="tp-hero-sub">
          每位導遊完成實名驗證，支援私人客製行程、台灣本土付款、訂單全程可追蹤。
        </p>
        <div className="tp-trust-grid">
          <div>✅ 實名認證導遊</div>
          <div>🗺️ 量身訂製行程</div>
          <div>💰 退款 3 天到帳</div>
          <div>📞 緊急熱線 30 分鐘</div>
        </div>
        <div className="tp-cta-row">
          <Link className="tp-btn tp-btn-primary" href="/activities">立即尋找導遊</Link>
          <Link className="tp-btn tp-btn-ghost" href="/why-choose-us">了解更多</Link>
        </div>
      </div>
    </section>
  );
}

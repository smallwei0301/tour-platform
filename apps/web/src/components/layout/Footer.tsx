'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Footer() {
  const pathname = usePathname();

  if (pathname === '/') {
    return null;
  }

  return (
    <footer className="tp-footer">
      <div className="tp-container">
        <div className="tp-footer-main-grid">
          {/* Col 1: Brand + App download */}
          <section className="tp-footer-brand">
            <h3 className="tp-footer-logo">Tour Platform</h3>
            <p>台灣在地導遊交易平台<br />找到懂路的人，帶你走進台灣最有故事的地方。</p>
            <div className="tp-footer-app-badges">
              <a href="#" className="tp-footer-app-badge" aria-label="App Store">
                <span>🍎</span>
                <div>
                  <small>Download on the</small>
                  <strong>App Store</strong>
                </div>
              </a>
              <a href="#" className="tp-footer-app-badge" aria-label="Google Play">
                <span>▶</span>
                <div>
                  <small>GET IT ON</small>
                  <strong>Google Play</strong>
                </div>
              </a>
            </div>
            <div className="tp-footer-social">
              <a href="#" aria-label="Facebook">FB</a>
              <a href="#" aria-label="Instagram">IG</a>
              <a href="#" aria-label="Line">LINE</a>
            </div>
          </section>

          {/* Col 2: Explore */}
          <section>
            <h4>探索行程</h4>
            <ul>
              <li><Link href="/activities">全部行程</Link></li>
              <li><Link href="/theme/cave-exploration">柴山探洞</Link></li>
              <li><Link href="/theme/river-trekking">野外溯溪</Link></li>
              <li><Link href="/activities?category=food">美食導覽</Link></li>
              <li><Link href="/activities?category=hiking">登山健行</Link></li>
            </ul>
          </section>

          {/* Col 3: Platform */}
          <section>
            <h4>平台資訊</h4>
            <ul>
              <li><Link href="/about">關於我們</Link></li>
              <li><Link href="/guides">認識導遊</Link></li>
              <li><Link href="/guide/apply">成為導遊</Link></li>
              <li><Link href="/blog">旅遊指南</Link></li>
              <li><Link href="/why-choose-us">為什麼選擇我們</Link></li>
              <li><Link href="/contact">聯絡我們</Link></li>
            </ul>
          </section>

          {/* Col 4: Support + Legal */}
          <section>
            <h4>客戶支援</h4>
            <ul>
              <li><Link href="/faq">常見問題</Link></li>
              <li><Link href="/orders">訂單查詢</Link></li>
              <li><Link href="/contact">客服聯絡</Link></li>
            </ul>
            <h4 style={{ marginTop: 20 }}>法律</h4>
            <ul>
              <li><Link href="/legal/privacy">隱私政策</Link></li>
              <li><Link href="/legal/terms">服務條款</Link></li>
              <li><Link href="/legal/refund">退款政策</Link></li>
            </ul>
          </section>
        </div>

        {/* Region links */}
        <div className="tp-footer-regions-wrap">
          <p className="tp-footer-regions-title">依地區探索</p>
          <div className="tp-footer-regions-list">
            {['台北', '新北', '桃園', '台中', '台南', '高雄', '花蓮', '台東', '宜蘭', '屏東', '澎湖', '金門'].map((c) => (
              <Link
                key={c}
                href={`/activities?region=${encodeURIComponent(c)}`}
                className="tp-footer-region-link"
              >
                {c}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="tp-footer-copy">
        © 2026 Tour Platform · 台灣 · 保留一切權利
      </div>
    </footer>
  );
}

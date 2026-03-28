import Link from 'next/link';

const regions = {
  '北部': ['台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣'],
  '中部': ['苗栗縣', '台中市', '南投縣', '彰化縣', '雲林縣'],
  '南部': ['嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣'],
  '東部': ['宜蘭縣', '花蓮縣', '台東縣'],
  '離島': ['澎湖縣', '金門縣', '連江縣（馬祖）'],
};

export function Footer() {
  return (
    <footer className="tp-footer">
      {/* Region links */}
      <div className="tp-container" style={{ padding: '28px 0 0' }}>
        <h4 style={{ color: '#fff', marginBottom: 12, fontSize: 14, letterSpacing: 1 }}>依地區探索行程</h4>
        <div className="tp-footer-regions" style={{ display: 'grid', gap: 12, paddingBottom: 20, borderBottom: '1px solid #2f2f2f' }}>
          {Object.entries(regions).map(([label, cities]) => (
            <div key={label}>
              <p style={{ color: 'var(--tp-accent)', fontWeight: 700, marginBottom: 6, fontSize: 13 }}>【{label}】</p>
              <p style={{ fontSize: 12, lineHeight: 1.8, color: '#999' }}>
                {cities.map((c, i) => (
                  <span key={c}>
                    <Link href={`/activities?region=${encodeURIComponent(c)}`} style={{ color: '#999' }}>{c}</Link>
                    {i < cities.length - 1 && ' · '}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="tp-container tp-footer-grid">
        <section>
          <h4>Tour Platform</h4>
          <p>台灣在地導遊交易平台<br />找到懂路的人，帶你走進台灣最有故事的地方。</p>
        </section>
        <section>
          <h4>平台</h4>
          <ul>
            <li><Link href="/about">關於我們</Link></li>
            <li><Link href="/blog">旅遊指南</Link></li>
            <li><Link href="/why-choose-us">為什麼選擇我們</Link></li>
            <li><Link href="/contact">聯絡我們</Link></li>
            <li><Link href="/faq">常見問題</Link></li>
          </ul>
        </section>
        <section>
          <h4>導遊</h4>
          <ul>
            <li><Link href="/guide/apply">成為導遊</Link></li>
            <li><Link href="/guides">全部導遊</Link></li>
          </ul>
        </section>
        <section>
          <h4>法律</h4>
          <ul>
            <li><Link href="/legal/privacy">隱私政策</Link></li>
            <li><Link href="/legal/terms">服務條款</Link></li>
            <li><Link href="/legal/refund">退款政策</Link></li>
          </ul>
        </section>
      </div>
      <div className="tp-footer-copy">© 2026 Tour Platform · 台灣 · 保留一切權利</div>
    </footer>
  );
}

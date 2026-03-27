export function Footer() {
  return (
    <footer className="tp-footer">
      <div className="tp-container tp-footer-grid">
        <section>
          <h4>Tour Platform</h4>
          <p>台灣在地導遊交易平台，先做成交閉環，再擴規模。</p>
        </section>
        <section>
          <h4>平台</h4>
          <ul>
            <li><a href="/about">關於我們</a></li>
            <li><a href="/blog">旅遊指南</a></li>
            <li><a href="/why-choose-us">為什麼選擇我們</a></li>
          </ul>
        </section>
        <section>
          <h4>導遊</h4>
          <ul>
            <li><a href="/guide/apply">成為導遊</a></li>
            <li><a href="/guides">全部導遊</a></li>
          </ul>
        </section>
        <section>
          <h4>法律</h4>
          <ul>
            <li><a href="/legal/privacy">隱私政策</a></li>
            <li><a href="/legal/terms">服務條款</a></li>
            <li><a href="/legal/refund">退款政策</a></li>
          </ul>
        </section>
      </div>
      <div className="tp-footer-copy">© 2026 Tour Platform · 台灣 · 保留一切權利</div>
    </footer>
  );
}

import Link from 'next/link';

export default async function ActivityDetailPage({ params }: { params: Promise<{ region: string; slug: string }> }) {
  const { region, slug } = await params;

  return (
    <main className="tp-container tp-detail">
      <div className="tp-breadcrumb">首頁 &gt; {decodeURIComponent(region)} &gt; {decodeURIComponent(slug)}</div>

      <section className="tp-detail-layout">
        <article className="tp-detail-main">
          <div className="tp-gallery-main" />
          <div className="tp-gallery-subgrid">
            <div className="tp-gallery-sub" />
            <div className="tp-gallery-sub" />
            <div className="tp-gallery-sub" />
            <div className="tp-gallery-sub tp-gallery-more">+8 張</div>
          </div>

          <h1>大稻埕百年老街深度漫步</h1>
          <p className="tp-detail-meta">⭐ 5.0（12 則評價） · 📍 台北市大同區</p>

          <div className="tp-badges">
            <span>✅ 認證導遊</span>
            <span>🕐 3 小時</span>
            <span>🚶 步行</span>
            <span>👥 1~8 人</span>
          </div>

          <section className="tp-detail-block">
            <h2>行程簡介</h2>
            <p>
              跟著在地導遊走進大稻埕街區，從迪化街布行、霞海城隍廟到永樂市場，
              不是打卡式走馬看花，而是把街區背後的人物與歷史串成真正可感受的故事。
            </p>
          </section>

          <section className="tp-detail-block">
            <h2>行程包含 / 不含</h2>
            <ul>
              <li>✅ 專業在地導遊全程陪同</li>
              <li>✅ 路線導覽與文化解說</li>
              <li>❌ 交通與餐飲費用</li>
            </ul>
          </section>

          <section className="tp-detail-block">
            <h2>行程規劃（時間軸）</h2>
            <ol className="tp-timeline">
              <li><strong>09:00</strong> 集合：捷運大橋頭站 2 號出口</li>
              <li><strong>09:15</strong> 迪化街布行區導覽</li>
              <li><strong>10:00</strong> 霞海城隍廟文化故事</li>
              <li><strong>10:45</strong> 永樂市場南北貨路線</li>
              <li><strong>11:30</strong> 行程結束，自由探索</li>
            </ol>
          </section>

          <section className="tp-detail-block">
            <h2>關於你的導遊</h2>
            <p>陳建志 · ✅ 實名已驗證 · ⭐ 5.0（47 次服務） · 🌍 中文、英語</p>
            <Link className="tp-link" href="/guides/chen-jian-zhi">查看完整導遊簡介 →</Link>
          </section>
        </article>

        <aside className="tp-booking-side">
          <div className="tp-booking-card">
            <p className="tp-price">起價 NT$1,500 / 人</p>
            <label>選擇日期<input type="date" /></label>
            <label>參加人數<input type="number" defaultValue={2} min={1} max={20} /></label>
            <p className="tp-total">總計：NT$3,000</p>
            <button className="tp-btn tp-btn-primary tp-full">立即預約</button>
            <button className="tp-btn tp-btn-ghost tp-full">✉️ 詢問導遊</button>
            <div className="tp-booking-note">
              <p>🔒 安全付款（ECPay / LINE Pay）</p>
              <p>✅ 免費取消（依各行程政策）</p>
              <p>📞 緊急熱線 30 分鐘回應</p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

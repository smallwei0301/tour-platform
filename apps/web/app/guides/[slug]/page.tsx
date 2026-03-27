import Link from 'next/link';

export default async function GuideProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <main className="tp-container tp-guide-detail">
      <div className="tp-guide-cover" />

      <section className="tp-guide-layout">
        <article>
          <div className="tp-guide-head-card">
            <div className="tp-guide-avatar" />
            <div>
              <h1>陳建志</h1>
              <p>✅ 已驗證 · ⭐ 5.0（47 則評價） · 📍 台北市 · 🌍 中文、英語</p>
            </div>
          </div>

          <section className="tp-detail-block">
            <h2>關於我</h2>
            <p>
              我在大稻埕長大，從小就在迪化街布行區穿梭。跟著我走，你看到的不是景點清單，
              而是這個街區如何活過百年、如何在現代城市裡保留生活溫度。
            </p>
          </section>

          <section className="tp-detail-block">
            <h2>我的行程</h2>
            <div className="tp-card-grid tp-card-grid-activities">
              <article className="tp-card">
                <div className="tp-card-img" />
                <h3>大稻埕百年老街深度漫步</h3>
                <p>🕐 3小時 · 👥 1~8</p>
                <Link className="tp-link" href="/activities/taipei/dadadaocheng-walk">查看行程 →</Link>
              </article>
              <article className="tp-card">
                <div className="tp-card-img" />
                <h3>台北夜市文化探索</h3>
                <p>🕐 4小時 · 👥 1~6</p>
                <Link className="tp-link" href="/activities/taipei/night-market">查看行程 →</Link>
              </article>
            </div>
          </section>

          <section className="tp-detail-block">
            <h2>認證與資歷</h2>
            <ul>
              <li>✅ 實名 KYC 驗證完成</li>
              <li>🏆 精選導遊（評分 5.0）</li>
              <li>🗣️ 外語接待（英語）</li>
            </ul>
          </section>
        </article>

        <aside className="tp-booking-side">
          <div className="tp-booking-card">
            <div className="tp-guide-avatar" style={{ width: 80, height: 80 }} />
            <p className="tp-price" style={{ fontSize: 20, marginTop: 8 }}>陳建志</p>
            <p>⭐ 5.0（47 則）</p>
            <button className="tp-btn tp-btn-primary tp-full">傳訊息給導遊</button>
            <Link className="tp-btn tp-btn-ghost tp-full" href="/activities">查看行程</Link>
          </div>
        </aside>
      </section>

      <p className="tp-breadcrumb" style={{ marginTop: 12 }}>Profile: {decodeURIComponent(slug)}</p>
    </main>
  );
}

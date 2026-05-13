import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="tp-container tp-editorial-page">
      <section
        className="tp-editorial-hero"
        style={{
          backgroundImage:
            'linear-gradient(rgba(12, 24, 18, 0.38), rgba(12, 24, 18, 0.52)), url(/images/midao-style/about-hero.png)',
        }}
      >
        <h1>關於我們</h1>
        <p>
          我們相信，最好的旅行不是跟團趕景點，而是找到一個懂路的人，帶你走進真正有故事的地方。
        </p>
      </section>

      <section className="tp-editorial-story">
        <h2>為什麼做這件事？</h2>
        <p>
          台灣有非常多在地的好導遊，他們了解自己生活的土地、知道哪些路線最有記憶點、也知道如何讓旅客安全又開心地探索。
          但這些導遊大多沒有自己的平台，旅客也很難找到他們。
        </p>
        <p>
          Tour Platform 要做的事很簡單：
          <strong>讓好的在地導遊被看見，讓旅客可以直接預約、安心付款、享受一段有品質的體驗。</strong>
        </p>
        <p>
          我們先從高雄柴山探洞、台北老街、花蓮溯溪這些最有特色的行程開始，再逐步拓展到全台灣。
        </p>
      </section>

      <section className="tp-editorial-kpis">
        {[
          { num: '3+', label: '合作導遊' },
          { num: '4+', label: '精選行程' },
          { num: '22', label: '涵蓋縣市（目標）' },
          { num: '15%', label: '平台抽成（業界最低）' },
        ].map((d) => (
          <div key={d.label} className="tp-editorial-kpi-card">
            <p className="tp-editorial-kpi-num">{d.num}</p>
            <p className="tp-editorial-kpi-label">{d.label}</p>
          </div>
        ))}
      </section>

      <section className="tp-editorial-cta">
        <h2>一起讓台灣的好導遊被看見</h2>
        <div className="tp-editorial-cta-row">
          <Link href="/guide/apply" className="tp-btn tp-btn-primary">
            成為導遊
          </Link>
          <Link href="/activities" className="tp-btn tp-btn-ghost">
            探索行程
          </Link>
        </div>
      </section>
    </main>
  );
}

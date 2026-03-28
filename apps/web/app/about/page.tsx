import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      {/* Hero */}
      <section style={{
        backgroundImage: 'linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.5)), url(https://images.unsplash.com/photo-1528164344705-47542687000d?w=1400&q=80)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        borderRadius: 14, padding: '60px 40px', marginTop: 18, color: '#fff',
      }}>
        <h1 style={{ fontSize: 36, marginBottom: 12 }}>關於我們</h1>
        <p style={{ fontSize: 18, maxWidth: 600, lineHeight: 1.7, opacity: 0.95 }}>
          我們相信，最好的旅行不是跟團趕景點，而是找到一個懂路的人，帶你走進真正有故事的地方。
        </p>
      </section>

      {/* Story */}
      <section style={{ marginTop: 40, maxWidth: 720 }}>
        <h2>為什麼做這件事？</h2>
        <p style={{ lineHeight: 1.8, color: 'var(--tp-muted)', marginBottom: 16 }}>
          台灣有非常多在地的好導遊，他們了解自己生活的土地、知道哪些路線最有記憶點、也知道如何讓旅客安全又開心地探索。
          但這些導遊大多沒有自己的平台，旅客也很難找到他們。
        </p>
        <p style={{ lineHeight: 1.8, color: 'var(--tp-muted)', marginBottom: 16 }}>
          Tour Platform 要做的事很簡單：<strong>讓好的在地導遊被看見，讓旅客可以直接預約、安心付款、享受一段有品質的體驗。</strong>
        </p>
        <p style={{ lineHeight: 1.8, color: 'var(--tp-muted)' }}>
          我們先從高雄柴山探洞、台北老街、花蓮溯溪這些最有特色的行程開始，再逐步拓展到全台灣。
        </p>
      </section>

      {/* Numbers */}
      <section style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { num: '3+', label: '合作導遊' },
          { num: '4+', label: '精選行程' },
          { num: '22', label: '涵蓋縣市（目標）' },
          { num: '15%', label: '平台抽成（業界最低）' },
        ].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', padding: 20, border: '1px solid var(--tp-border)', borderRadius: 12 }}>
            <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--tp-primary)', margin: 0 }}>{d.num}</p>
            <p style={{ color: 'var(--tp-muted)', margin: '4px 0 0', fontSize: 14 }}>{d.label}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section style={{ marginTop: 40, textAlign: 'center', padding: '40px 0' }}>
        <h2>一起讓台灣的好導遊被看見</h2>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
          <Link href="/guide/apply" className="tp-btn tp-btn-primary" style={{ padding: '12px 28px' }}>成為導遊</Link>
          <Link href="/activities" className="tp-btn tp-btn-ghost" style={{ padding: '12px 28px' }}>探索行程</Link>
        </div>
      </section>
    </main>
  );
}

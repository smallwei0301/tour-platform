import Link from 'next/link';

const trustValuePoints = [
  {
    title: '不是只有驗證標章，而是更快做對決定',
    body: '導遊資料、評論與專長一次看清楚，第一次預約也能在幾分鐘內選到對的人。',
  },
  {
    title: '不是塞滿行程，而是把時間用在真正有感的體驗',
    body: '你看到的不只是「去哪裡」，而是每條路線適合誰、會帶走什麼記憶。',
  },
  {
    title: '不是賭運氣，而是用在地知識降低踩雷成本',
    body: '由熟悉地方脈絡的導遊帶路，少走錯路、少花冤枉時間，旅程更穩定。',
  },
];

export function ValueTrustSection() {
  return (
    <section className="tp-section" style={{ paddingTop: 0 }}>
      <div className="tp-container">
        <div className="tp-section-head" style={{ marginBottom: 18 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>為什麼這種玩法更值得</h2>
            <p style={{ margin: 0, color: 'var(--tp-muted)', fontSize: 14 }}>
              我們把「平台該有的基本條件」，轉成你可以直接感受到的旅遊價值。
            </p>
          </div>
          <Link href="/why-choose-us" className="tp-link">
            看完整說明 →
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {trustValuePoints.map((point) => (
            <article key={point.title} style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 14, background: '#fff' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700, lineHeight: 1.5 }}>{point.title}</p>
              <p style={{ margin: 0, color: 'var(--tp-muted)', fontSize: 14, lineHeight: 1.65 }}>{point.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

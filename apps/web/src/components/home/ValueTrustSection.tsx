import Link from 'next/link';

const trustValuePoints = [
  {
    title: '看清楚再選，不賭人品',
    body: '導遊資料、評論、專長一眼看清，幾分鐘選對人。',
  },
  {
    title: '走進回憶，而不是趕行程',
    body: '看到的是「適合誰」「會記住什麼」，不只是地點。',
  },
  {
    title: '有在地人帶路，少花冤枉時間',
    body: '熟悉地方的導遊，幫你避開陷阱、走穩定路線。',
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
              平台基本功轉成你能感受到的旅遊價值。
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

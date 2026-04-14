import Link from 'next/link';

type Experience = {
  slug: string;
  title: string;
  priceTwd: number;
  durationLabel?: string;
  locationLabel?: string;
  levelLabel?: string;
  highlightBullets?: string[];
  description?: string;
};

function fallbackExperience(slug: string): Experience {
  return {
    slug,
    title: '在地深度體驗',
    priceTwd: 1800,
    durationLabel: '約 4 小時',
    locationLabel: '台灣在地路線',
    levelLabel: '新手友善',
    highlightBullets: ['實名在地導遊', '小團體深度體驗', '透明價格與彈性取消'],
    description: '跟著懂路的人，走進最有故事的地方。'
  };
}

export default async function ExperiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/api/experiences`, { cache: 'no-store' }).catch(() => null);

  let experience = fallbackExperience(slug);
  if (response?.ok) {
    const json = await response.json().catch(() => null);
    const found = json?.data?.find((x: any) => x.slug === slug);
    if (found) {
      experience = {
        slug: found.slug,
        title: found.title,
        priceTwd: Number(found.priceTwd ?? found.price_twd ?? 1800),
        durationLabel: found.durationLabel || found.duration_display || '約 4 小時',
        locationLabel: found.locationLabel || found.region || '台灣在地路線',
        levelLabel: found.levelLabel || '新手友善',
        highlightBullets: found.highlightBullets || found.highlights || ['實名在地導遊', '小團體深度體驗', '透明價格與彈性取消'],
        description: found.description || '跟著懂路的人，走進最有故事的地方。',
      };
    }
  }

  return (
    <main className="tp-detail">
      <div className="tp-container">
        <div className="tp-breadcrumb">首頁 / 體驗 / {experience.title}</div>

        <section className="tp-detail-layout">
          <article className="tp-detail-main">
            <div className="tp-gallery-main" />

            <h1 style={{ marginTop: 16, marginBottom: 8, fontSize: 32 }}>{experience.title}</h1>
            <p className="tp-detail-meta">{experience.locationLabel} ・ {experience.durationLabel}</p>

            <div className="tp-badges">
              <span>{experience.levelLabel}</span>
              <span>可立即預約</span>
              <span>電子憑證</span>
            </div>

            <section className="tp-detail-block">
              <h2>體驗介紹</h2>
              <p>{experience.description}</p>
            </section>

            <section className="tp-detail-block">
              <h2>行程亮點</h2>
              <ul className="tp-timeline">
                {(experience.highlightBullets || []).map((h, idx) => (
                  <li key={`${experience.slug}-highlight-${idx}`}>{h}</li>
                ))}
              </ul>
            </section>

            <section className="tp-detail-block">
              <h2>預訂說明</h2>
              <ul className="tp-timeline">
                <li>建議提前預約，熱門時段容易額滿。</li>
                <li>完成下單後可於付款頁完成金流。</li>
                <li>若需客服協助，請於訂單頁查看聯絡資訊。</li>
              </ul>
            </section>
          </article>

          <aside className="tp-booking-side">
            <div className="tp-booking-card">
              <p style={{ margin: 0, color: 'var(--tp-muted)', fontSize: 14 }}>每人價格</p>
              <p className="tp-price">NT$ {experience.priceTwd.toLocaleString()}</p>

              <Link className="tp-btn tp-btn-primary tp-full" href={`/checkout?slug=${encodeURIComponent(experience.slug)}`}>
                立即預約
              </Link>
              <Link className="tp-btn tp-btn-ghost tp-full" href={`/activities`}>
                查看其他行程
              </Link>

              <p className="tp-booking-note">
                此頁為體驗詳情頁。若要直接完成預約，請點「立即預約」進入結帳流程。
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

import Link from 'next/link';
import { activities, guides } from '../../fixtures/data';
import { buildActivityHref } from '../../lib/activity-url';

const recommendationNotes: Record<string, string> = {
  'kaohsiung-chaishan-cave-experience': '在地導遊最常推薦給第一次來高雄的旅客。',
  'dadadaocheng-walk': '節奏輕鬆，適合半天走讀與拍照。',
  'hualien-river-trekking': '偏戶外體驗，適合想避開一般觀光路線。',
};

export function FeaturedTours() {
  const featured = activities.slice(0, 3);

  return (
    <section className="tp-section">
      <div className="tp-container">
        <div className="tp-section-head">
          <div>
            <h2 style={{ marginBottom: 4 }}>本週精選行程</h2>
            <p style={{ margin: 0, color: 'var(--tp-muted)', fontSize: 14 }}>
              由平台依「導遊在地經驗 × 行程完成度」挑出的推薦路線。
            </p>
          </div>
          <Link href="/activities" className="tp-link">查看全部 →</Link>
        </div>

        <div className="tp-card-grid tp-card-grid-featured" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {featured.map((a) => {
            const guide = guides.find((g) => g.slug === a.guideSlug);
            return (
              <article className="tp-card" key={a.slug}>
                <img
                  src={a.imageUrl}
                  alt={a.title}
                  className="tp-card-img"
                  style={{ background: 'none' }}
                  loading="lazy"
                />

                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    background: 'rgba(255, 109, 180, 0.12)',
                    color: '#b12871',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 999,
                  }}>
                    {a.category}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--tp-muted)' }}>{a.region}</span>
                </div>

                <h3 style={{ fontSize: 18, margin: '10px 0 8px', lineHeight: 1.4 }}>{a.title}</h3>

                {guide && (
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--tp-muted)' }}>
                    由 {guide.displayName} 帶路
                  </p>
                )}

                <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, color: '#2f2f2f' }}>
                  {recommendationNotes[a.slug] ?? '適合想用在地視角重新認識台灣的人。'}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <strong style={{ color: 'var(--tp-primary)', fontSize: 15 }}>{a.priceLabel}</strong>
                  <Link
                    className="tp-btn tp-btn-primary"
                    href={buildActivityHref({ slug: a.slug, region: a.region, regionSlug: a.regionSlug })}
                    style={{ fontSize: 13, padding: '6px 14px' }}
                  >
                    查看行程
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
